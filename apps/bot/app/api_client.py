from dataclasses import dataclass
from typing import Protocol

import httpx
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.settings import Settings


@dataclass(frozen=True)
class SyncResult:
    user_id: str
    consented: bool


@dataclass(frozen=True)
class Macros:
    kcal: int
    protein_g: int
    carb_g: int
    fat_g: int


@dataclass(frozen=True)
class TodayResult:
    has_profile: bool
    date: str
    targets: Macros | None
    consumed: Macros
    workout_summary: str | None
    weight_kg: float | None
    streak_days: int


@dataclass(frozen=True)
class PreviousMetric:
    value: float
    date: str


@dataclass(frozen=True)
class MetricRecorded:
    key: str
    value: float
    date: str
    previous: PreviousMetric | None


@dataclass(frozen=True)
class MealItem:
    name: str
    grams: float
    kcal: int


@dataclass(frozen=True)
class Meal:
    id: str
    meal_type: str
    status: str
    items: list[MealItem]
    total_kcal: int
    total_protein_g: float


@dataclass(frozen=True)
class MealTextResult:
    # draft | limit | not_food | refused | unavailable | invalid_image (photos only)
    outcome: str
    meal: Meal | None


@dataclass(frozen=True)
class MealConfirmed:
    meal: Meal
    consumed: Macros
    targets: Macros | None


@dataclass(frozen=True)
class AdviceItem:
    name: str
    detail: str


@dataclass(frozen=True)
class Advice:
    title: str
    items: list[AdviceItem]
    body: str
    today_line: str | None
    notices: list[str]


@dataclass(frozen=True)
class AskResult:
    # answer | limit | refused | unavailable
    outcome: str
    advice: Advice | None


def _advice(data: dict) -> Advice:
    return Advice(
        title=data["title"],
        items=[AdviceItem(name=i["name"], detail=i["detail"]) for i in data["items"]],
        body=data["body"],
        today_line=data.get("todayLine"),
        notices=list(data["notices"]),
    )


def _meal(data: dict) -> Meal:
    return Meal(
        id=data["id"],
        meal_type=data["mealType"],
        status=data["status"],
        items=[
            MealItem(name=i["name"], grams=float(i["grams"]), kcal=round(i["kcal"]))
            for i in data["items"]
        ],
        total_kcal=round(data["total"]["kcal"]),
        total_protein_g=float(data["total"]["proteinG"]),
    )


def _macros(data: dict) -> Macros:
    return Macros(
        kcal=round(data["kcal"]),
        protein_g=round(data["proteinG"]),
        carb_g=round(data["carbG"]),
        fat_g=round(data["fatG"]),
    )


# The AI calls (meals and ask) wait on a model; everything else keeps the 5 s default.
MEAL_TIMEOUT = 30.0
ASK_TIMEOUT = 30.0


class ApiError(Exception):
    """The api answered with a non-2xx status. Carries the status only, never the body."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"api responded {status_code}")
        self.status_code = status_code


class ApiClient(Protocol):
    def sync(self, line_user_id: str, display_name: str | None) -> SyncResult: ...

    def consent(self, line_user_id: str, version: str) -> None: ...

    def unfollow(self, line_user_id: str) -> None: ...

    def today(self, line_user_id: str) -> TodayResult: ...

    def record_metric(self, line_user_id: str, key: str, value: float) -> MetricRecorded: ...

    def log_meal_text(self, line_user_id: str, meal_type: str, text: str) -> MealTextResult: ...

    def log_meal_photo(self, line_user_id: str, image: bytes) -> MealTextResult: ...

    def confirm_meal(self, line_user_id: str, meal_id: str) -> MealConfirmed: ...

    def set_meal_type(self, line_user_id: str, meal_id: str, meal_type: str) -> Meal: ...

    def ask(self, line_user_id: str, text: str) -> AskResult: ...

    def reset_conversation(self, line_user_id: str) -> None: ...


class HttpApiClient:
    def __init__(self, settings: Settings) -> None:
        self._base = settings.api_url
        self._audience = settings.internal_audience

    def _post(self, path: str, body: dict[str, object], timeout: float = 5.0) -> httpx.Response:
        token = id_token.fetch_id_token(Request(), self._audience)
        res = httpx.post(
            f"{self._base}{path}",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
        )
        if res.status_code >= 300:
            raise ApiError(res.status_code)
        return res

    def _post_bytes(
        self, path: str, line_user_id: str, content: bytes, timeout: float
    ) -> httpx.Response:
        token = id_token.fetch_id_token(Request(), self._audience)
        res = httpx.post(
            f"{self._base}{path}",
            content=content,
            headers={
                "Authorization": f"Bearer {token}",
                "x-line-user-id": line_user_id,
                "content-type": "application/octet-stream",
            },
            timeout=timeout,
        )
        if res.status_code >= 300:
            raise ApiError(res.status_code)
        return res

    def sync(self, line_user_id: str, display_name: str | None) -> SyncResult:
        body = {"lineUserId": line_user_id}
        if display_name is not None:
            body["displayName"] = display_name
        data = self._post("/internal/users/sync", body).json()
        return SyncResult(user_id=data["userId"], consented=bool(data["consented"]))

    def consent(self, line_user_id: str, version: str) -> None:
        self._post("/internal/users/consent", {"lineUserId": line_user_id, "version": version})

    def unfollow(self, line_user_id: str) -> None:
        self._post("/internal/users/unfollow", {"lineUserId": line_user_id})

    def today(self, line_user_id: str) -> TodayResult:
        data = self._post("/internal/users/today", {"lineUserId": line_user_id}).json()
        targets = data.get("targets")
        weight = data.get("weightKg")
        return TodayResult(
            has_profile=bool(data["hasProfile"]),
            date=data["date"],
            targets=_macros(targets) if targets else None,
            consumed=_macros(data["consumed"]),
            workout_summary=data.get("workoutSummary"),
            weight_kg=float(weight) if weight is not None else None,
            streak_days=int(data["streakDays"]),
        )

    def record_metric(self, line_user_id: str, key: str, value: float) -> MetricRecorded:
        data = self._post(
            "/internal/body-metrics",
            {"lineUserId": line_user_id, "key": key, "value": value},
        ).json()
        previous = data.get("previous")
        return MetricRecorded(
            key=data["key"],
            value=float(data["value"]),
            date=data["date"],
            previous=(
                PreviousMetric(value=float(previous["value"]), date=previous["date"])
                if previous
                else None
            ),
        )

    def log_meal_text(self, line_user_id: str, meal_type: str, text: str) -> MealTextResult:
        data = self._post(
            "/internal/meals/text",
            {"lineUserId": line_user_id, "mealType": meal_type, "text": text},
            timeout=MEAL_TIMEOUT,
        ).json()
        meal = _meal(data["meal"]) if data["outcome"] == "draft" else None
        return MealTextResult(outcome=data["outcome"], meal=meal)

    def log_meal_photo(self, line_user_id: str, image: bytes) -> MealTextResult:
        data = self._post_bytes(
            "/internal/meals/photo", line_user_id, image, timeout=MEAL_TIMEOUT
        ).json()
        meal = _meal(data["meal"]) if data["outcome"] == "draft" else None
        return MealTextResult(outcome=data["outcome"], meal=meal)

    def confirm_meal(self, line_user_id: str, meal_id: str) -> MealConfirmed:
        data = self._post(
            f"/internal/meals/{meal_id}/confirm",
            {"lineUserId": line_user_id},
            timeout=MEAL_TIMEOUT,
        ).json()
        targets = data["today"].get("targets")
        return MealConfirmed(
            meal=_meal(data["meal"]),
            consumed=_macros(data["today"]["consumed"]),
            targets=_macros(targets) if targets else None,
        )

    def set_meal_type(self, line_user_id: str, meal_id: str, meal_type: str) -> Meal:
        data = self._post(
            f"/internal/meals/{meal_id}/type",
            {"lineUserId": line_user_id, "mealType": meal_type},
            timeout=MEAL_TIMEOUT,
        ).json()
        return _meal(data["meal"])

    def ask(self, line_user_id: str, text: str) -> AskResult:
        data = self._post(
            "/internal/ai/ask",
            {"lineUserId": line_user_id, "text": text},
            timeout=ASK_TIMEOUT,
        ).json()
        advice = _advice(data["advice"]) if data["outcome"] == "answer" else None
        return AskResult(outcome=data["outcome"], advice=advice)

    def reset_conversation(self, line_user_id: str) -> None:
        self._post("/internal/ai/reset", {"lineUserId": line_user_id})


class WorkoutPr(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    exercise_id: str
    name_zh: str
    name_en: str | None = None
    e1rm: float
    weight_kg: float
    reps: int


class WorkoutSummary(BaseModel):
    """Finish summary sent by the api; its `notified` field is meaningless here and ignored."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    volume_kg: float = Field(ge=0)
    exercise_count: int = Field(ge=0)
    set_count: int = Field(ge=0)
    cardio_minutes: float = Field(ge=0)
    prs: list[WorkoutPr] = []
