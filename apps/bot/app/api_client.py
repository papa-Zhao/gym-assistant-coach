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


def _macros(data: dict) -> Macros:
    return Macros(
        kcal=round(data["kcal"]),
        protein_g=round(data["proteinG"]),
        carb_g=round(data["carbG"]),
        fat_g=round(data["fatG"]),
    )


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


class HttpApiClient:
    def __init__(self, settings: Settings) -> None:
        self._base = settings.api_url
        self._audience = settings.internal_audience

    def _post(self, path: str, body: dict[str, object]) -> httpx.Response:
        token = id_token.fetch_id_token(Request(), self._audience)
        res = httpx.post(
            f"{self._base}{path}",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
            timeout=5.0,
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
