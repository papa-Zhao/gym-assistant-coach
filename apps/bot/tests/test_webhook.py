import base64
import hashlib
import hmac
import json
import logging
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api_client import ApiError, SyncResult
from app.handlers import create_app
from app.settings import CONSENT_VERSION, Settings

SECRET = "test-channel-secret"
USER = "U" + "0123456789abcdef" * 2
SETTINGS = Settings(
    line_channel_secret=SECRET,
    line_channel_access_token="test-access-token",
    api_url="https://api.test",
    internal_audience="gac-api-internal",
    liff_id="1234-abcd",
    public_site_url="https://site.test",
)


class FakeApi:
    def __init__(self, consented: bool = False, fail_status: int | None = None) -> None:
        self.consented = consented
        self.fail_status = fail_status
        self.calls: list[tuple[Any, ...]] = []

    def _maybe_fail(self) -> None:
        if self.fail_status is not None:
            raise ApiError(self.fail_status)

    def sync(self, line_user_id: str, display_name: str | None) -> SyncResult:
        self.calls.append(("sync", line_user_id, display_name))
        self._maybe_fail()
        return SyncResult(user_id="u-1", consented=self.consented)

    def consent(self, line_user_id: str, version: str) -> None:
        self.calls.append(("consent", line_user_id, version))
        self._maybe_fail()

    def unfollow(self, line_user_id: str) -> None:
        self.calls.append(("unfollow", line_user_id))
        self._maybe_fail()


class FakeLine:
    def __init__(self, name: str | None = "小明") -> None:
        self.name = name
        self.replies: list[tuple[str, list[dict[str, Any]]]] = []
        self.loading: list[str] = []

    def reply(self, reply_token: str, messages: list[dict[str, Any]]) -> None:
        self.replies.append((reply_token, messages))

    def profile_name(self, user_id: str) -> str | None:
        return self.name

    def show_loading(self, user_id: str) -> None:
        self.loading.append(user_id)


def sign(body: bytes) -> str:
    return base64.b64encode(hmac.new(SECRET.encode(), body, hashlib.sha256).digest()).decode()


def post(client: TestClient, events: list[dict[str, Any]], signature: str | None = None):
    body = json.dumps({"destination": "Ux", "events": events}, ensure_ascii=False).encode()
    return client.post(
        "/webhook",
        content=body,
        headers={"X-Line-Signature": signature or sign(body), "Content-Type": "application/json"},
    )


def event(kind: str, **extra: Any) -> dict[str, Any]:
    base = {
        "type": kind,
        "mode": "active",
        "timestamp": 1760000000000,
        "source": {"type": "user", "userId": USER},
        "webhookEventId": "01ABC",
        "deliveryContext": {"isRedelivery": False},
    }
    if kind == "follow":
        base["follow"] = {"isUnblocked": False}
    if kind != "unfollow":
        base["replyToken"] = "reply-token"
    return {**base, **extra}


def text_event(text: str = "你好") -> dict[str, Any]:
    return event("message", message={"type": "text", "id": "1", "quoteToken": "q", "text": text})


def consent_postback(version: str = CONSENT_VERSION) -> dict[str, Any]:
    return event("postback", postback={"data": f"action=consent&version={version}"})


@pytest.fixture
def api() -> FakeApi:
    return FakeApi()


@pytest.fixture
def line() -> FakeLine:
    return FakeLine()


@pytest.fixture
def client(api: FakeApi, line: FakeLine) -> TestClient:
    return TestClient(create_app(SETTINGS, api, line))


def test_bad_signature_returns_400_and_calls_nothing(client, api, line) -> None:
    res = post(client, [event("follow")], signature="bm9wZQ==")
    assert res.status_code == 400
    assert api.calls == []
    assert line.replies == []
    assert line.loading == []


def test_empty_events_verify_request_returns_200(client, api, line) -> None:
    res = post(client, [])
    assert res.status_code == 200
    assert api.calls == []
    assert line.replies == []


def test_follow_unconsented_replies_welcome_with_consent_postback(client, api, line) -> None:
    res = post(client, [event("follow")])
    assert res.status_code == 200
    assert api.calls == [("sync", USER, "小明")]
    assert line.loading == [USER]
    token, msgs = line.replies[0]
    assert token == "reply-token"
    dumped = json.dumps(msgs, ensure_ascii=False)
    assert "歡迎使用 Gym Assistant Coach" in dumped
    assert "https://site.test/terms.html" in dumped
    assert "https://site.test/privacy.html" in dumped
    assert "我已滿 18 歲，同意並開始" in dumped
    assert f"action=consent&version={CONSENT_VERSION}" in dumped
    assert "#B4492A" in dumped


def test_follow_without_profile_omits_display_name(api, line) -> None:
    line.name = None
    post(TestClient(create_app(SETTINGS, api, line)), [event("follow")])
    assert api.calls == [("sync", USER, None)]


def test_follow_consented_replies_welcome_back() -> None:
    api, line = FakeApi(consented=True), FakeLine()
    post(TestClient(create_app(SETTINGS, api, line)), [event("follow")])
    assert line.replies == [
        ("reply-token", [{"type": "text", "text": "歡迎回來！你的紀錄都還在。"}])
    ]


def test_consent_postback_records_and_replies_liff_link(client, api, line) -> None:
    res = post(client, [consent_postback()])
    assert res.status_code == 200
    assert api.calls == [("consent", USER, CONSENT_VERSION)]
    dumped = json.dumps(line.replies[0][1], ensure_ascii=False)
    assert "謝謝！最後一步：填寫個人檔案，我才能幫你算每天的目標。" in dumped
    assert "開始設定" in dumped
    assert "https://liff.line.me/1234-abcd" in dumped


def test_postback_with_other_version_is_ignored(client, api, line) -> None:
    post(client, [consent_postback("1999-01-01")])
    assert api.calls == []
    assert line.replies == []


def test_message_before_consent_replies_welcome_again(client, api, line) -> None:
    post(client, [text_event()])
    assert api.calls == [("sync", USER, "小明")]
    assert "我已滿 18 歲，同意並開始" in json.dumps(line.replies[0][1], ensure_ascii=False)


def test_message_after_consent_replies_placeholder() -> None:
    api, line = FakeApi(consented=True), FakeLine()
    post(TestClient(create_app(SETTINGS, api, line)), [text_event()])
    assert line.replies[0][1] == [{"type": "text", "text": "收到！記錄功能下個版本就會開放。"}]


def test_unfollow_calls_api_and_does_not_reply(client, api, line) -> None:
    res = post(client, [event("unfollow")])
    assert res.status_code == 200
    assert api.calls == [("unfollow", USER)]
    assert line.replies == []


def test_chinese_text_body_signature_verified_on_raw_bytes(client, api) -> None:
    body = json.dumps(
        {"destination": "Ux", "events": [text_event("今天練胸，臥推 60 公斤 💪")]},
        ensure_ascii=False,
    ).encode("utf-8")
    res = client.post(
        "/webhook",
        content=body,
        headers={"X-Line-Signature": sign(body), "Content-Type": "application/json"},
    )
    assert res.status_code == 200
    assert api.calls == [("sync", USER, "小明")]


def test_api_failure_still_returns_200(line, caplog) -> None:
    api = FakeApi(fail_status=503)
    client = TestClient(create_app(SETTINGS, api, line))
    with caplog.at_level(logging.INFO):
        res = post(client, [event("follow"), event("unfollow")])
    assert res.status_code == 200
    assert line.replies == []
    assert [c[0] for c in api.calls] == ["sync", "unfollow"]
    logged = caplog.text
    assert "503" in logged
    assert "follow" in logged
    assert USER not in logged
    assert "test-access-token" not in logged


def test_health_needs_no_settings(monkeypatch) -> None:
    for name in (
        "LINE_CHANNEL_SECRET",
        "LINE_CHANNEL_ACCESS_TOKEN",
        "API_URL",
        "INTERNAL_AUDIENCE",
        "LIFF_ID",
        "PUBLIC_SITE_URL",
    ):
        monkeypatch.delenv(name, raising=False)
    from app.main import app

    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "bot"}


def test_messages_are_valid_for_the_line_sdk() -> None:
    from app import messages
    from app.line_replier import _to_sdk

    for message in (
        messages.welcome("https://site.test"),
        messages.consent_done("1234-abcd"),
        messages.welcome_back(),
        messages.placeholder_reply(),
    ):
        assert _to_sdk(message).to_dict()["type"] == message["type"]
