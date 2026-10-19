import json
from typing import Any

import pytest
from fastapi.testclient import TestClient
from linebot.v3.messaging import FlexMessage

from app import messages
from app.api_client import WorkoutSummary
from app.handlers import create_app
from app.line_replier import _to_sdk
from app.settings import Settings
from tests.test_webhook import SETTINGS, USER, FakeApi, FakeLine

AUDIENCE = "gac-bot-internal"
API_SA = "api-runtime@project.iam.gserviceaccount.com"
SETTINGS_WITH_INTERNAL = Settings(
    **{**SETTINGS.__dict__, "bot_audience": AUDIENCE, "api_sa_email": API_SA}
)
SUMMARY: dict[str, Any] = {
    "sessionId": "s-1",
    "volumeKg": 4210.5,
    "exerciseCount": 4,
    "setCount": 12,
    "cardioMinutes": 0,
    "prs": [
        {
            "exerciseId": "e-1",
            "nameZh": "槓鈴深蹲",
            "nameEn": "Barbell Squat",
            "e1rm": 116.7,
            "weightKg": 100,
            "reps": 5,
        }
    ],
    "notified": False,
}
BODY = {"lineUserId": USER, "summary": SUMMARY, "templateName": "推日"}


class PushLine(FakeLine):
    def __init__(self, fail: bool = False) -> None:
        super().__init__()
        self.fail = fail
        self.pushes: list[tuple[str, list[dict[str, Any]]]] = []

    def push(self, user_id: str, messages: list[dict[str, Any]]) -> None:
        if self.fail:
            raise RuntimeError(f"429 for {user_id}")
        self.pushes.append((user_id, messages))


def make_verifier(claims: dict[str, Any] | Exception):
    calls: list[tuple[str, str]] = []

    def verify(token: str, audience: str) -> dict[str, Any]:
        calls.append((token, audience))
        if isinstance(claims, Exception):
            raise claims
        return claims

    verify.calls = calls  # type: ignore[attr-defined]
    return verify


GOOD_CLAIMS = {"email": API_SA, "email_verified": True}


def client_for(line: PushLine, claims: dict[str, Any] | Exception = GOOD_CLAIMS):
    verify = make_verifier(claims)
    app = create_app(SETTINGS_WITH_INTERNAL, FakeApi(), line, verify_api_token=verify)
    return TestClient(app), verify


URL = "/internal/notify/workout-finished"
AUTH = {"Authorization": "Bearer good-token"}


def test_notify_without_token_is_401_and_does_not_push() -> None:
    line = PushLine()
    client, verify = client_for(line)
    for headers in ({}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer "}):
        res = client.post(URL, json=BODY, headers=headers)
        assert res.status_code == 401
        assert res.json() == {"error": "unauthorized"}
    assert line.pushes == []
    assert verify.calls == []  # type: ignore[attr-defined]


def test_notify_with_invalid_token_is_401() -> None:
    line = PushLine()
    client, _ = client_for(line, ValueError("bad token"))
    res = client.post(URL, json=BODY, headers=AUTH)
    assert res.status_code == 401
    assert res.json() == {"error": "unauthorized"}
    assert line.pushes == []


def test_notify_authenticates_before_reading_body() -> None:
    client, _ = client_for(PushLine(), ValueError("bad token"))
    res = client.post(URL, content=b"not json", headers=AUTH)
    assert res.status_code == 401


@pytest.mark.parametrize(
    "claims",
    [
        {"email": "someone-else@project.iam.gserviceaccount.com", "email_verified": True},
        {"email": API_SA, "email_verified": False},
        {"email": API_SA},
        {"email_verified": True},
    ],
)
def test_notify_with_wrong_service_account_is_401(claims: dict[str, Any]) -> None:
    line = PushLine()
    client, _ = client_for(line, claims)
    res = client.post(URL, json=BODY, headers=AUTH)
    assert res.status_code == 401
    assert res.json() == {"error": "unauthorized"}
    assert line.pushes == []


def test_notify_pushes_workout_done_flex() -> None:
    line = PushLine()
    client, verify = client_for(line)
    res = client.post(URL, json=BODY, headers=AUTH)
    assert res.status_code == 204
    assert verify.calls == [("good-token", AUDIENCE)]  # type: ignore[attr-defined]
    assert len(line.pushes) == 1
    user_id, sent = line.pushes[0]
    assert user_id == USER
    text = json.dumps(sent, ensure_ascii=False)
    assert "今天辛苦了！" in text
    assert "推日" in text
    assert "新紀錄：槓鈴深蹲 估算 1RM 116.7 kg（100 kg × 5）" in text
    assert sent[0]["altText"] == "訓練完成"


def test_notify_push_failure_returns_502(caplog: pytest.LogCaptureFixture) -> None:
    client, _ = client_for(PushLine(fail=True))
    with caplog.at_level("DEBUG"):
        res = client.post(URL, json=BODY, headers=AUTH)
    assert res.status_code == 502
    assert res.json() == {"error": "push_failed"}
    logged = caplog.text
    assert "RuntimeError" in logged
    assert USER not in logged
    assert "good-token" not in logged
    assert "槓鈴深蹲" not in logged


@pytest.mark.parametrize("user_id", ["U123", "u" + "0" * 32, "U" + "G" * 32, "U" + "0" * 33, ""])
def test_notify_rejects_bad_line_user_id(user_id: str) -> None:
    line = PushLine()
    client, _ = client_for(line)
    res = client.post(URL, json={**BODY, "lineUserId": user_id}, headers=AUTH)
    assert res.status_code == 400
    assert res.json() == {"error": "bad_request"}
    assert line.pushes == []


def test_notify_rejects_malformed_summary() -> None:
    line = PushLine()
    client, _ = client_for(line)
    res = client.post(URL, json={**BODY, "summary": {"volumeKg": "x"}}, headers=AUTH)
    assert res.status_code == 400
    assert line.pushes == []


def test_notify_unconfigured_internal_settings_is_401() -> None:
    app = create_app(SETTINGS, FakeApi(), PushLine(), verify_api_token=make_verifier(GOOD_CLAIMS))
    res = TestClient(app).post(URL, json=BODY, headers=AUTH)
    assert res.status_code == 401


def summary(**overrides: Any) -> WorkoutSummary:
    return WorkoutSummary.model_validate({**SUMMARY, **overrides})


def test_workout_done_flex_is_valid_for_sdk() -> None:
    with_pr = messages.workout_done(summary(), "推日", "1234-abcd")
    sdk = _to_sdk(with_pr)
    assert isinstance(sdk, FlexMessage)
    assert sdk.alt_text == "訓練完成"
    text = json.dumps(with_pr, ensure_ascii=False)
    for expected in ["4 個動作", "12 組", "總訓練量 4,211 kg", "推日", "看今天的總覽"]:
        assert expected in text
    assert "有氧" not in text
    button = with_pr["contents"]["footer"]["contents"][0]
    assert button["action"]["data"] == "action=today"
    assert button["action"]["displayText"] == "今日總覽"

    cardio_only = messages.workout_done(
        summary(setCount=0, volumeKg=0, exerciseCount=1, cardioMinutes=30, prs=[]), None, "x"
    )
    assert isinstance(_to_sdk(cardio_only), FlexMessage)
    text = json.dumps(cardio_only, ensure_ascii=False)
    assert "有氧 30 分鐘" in text
    assert "訓練" in text
    assert "組" not in text
    assert "總訓練量" not in text
    assert "新紀錄" not in text
