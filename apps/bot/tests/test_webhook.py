import base64
import hashlib
import hmac
import json
import logging
import re
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api_client import ApiError, Macros, MetricRecorded, PreviousMetric, SyncResult, TodayResult
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
    def __init__(
        self,
        consented: bool = False,
        fail_status: int | None = None,
        today: TodayResult | None = None,
        metric_previous: dict[str, Any] | None = None,
    ) -> None:
        self.consented = consented
        self.metric_previous = metric_previous
        self.today_result = today
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

    def today(self, line_user_id: str) -> TodayResult:
        self.calls.append(("today", line_user_id))
        self._maybe_fail()
        assert self.today_result is not None
        return self.today_result

    def record_metric(self, line_user_id: str, key: str, value: float) -> MetricRecorded:
        self.calls.append(("record_metric", line_user_id, key, value))
        self._maybe_fail()
        prev = self.metric_previous
        return MetricRecorded(
            key=key,
            value=value,
            date="2026-10-19",
            previous=PreviousMetric(prev["value"], prev["date"]) if prev else None,
        )


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


def menu_postback(data: str) -> dict[str, Any]:
    return event("postback", postback={"data": data})


NO_PROFILE = TodayResult(
    has_profile=False,
    date="2026-10-19",
    targets=None,
    consumed=Macros(0, 0, 0, 0),
    workout_summary=None,
    weight_kg=None,
    streak_days=0,
)
WITH_PROFILE = TodayResult(
    has_profile=True,
    date="2026-10-19",
    targets=Macros(2200, 140, 250, 60),
    consumed=Macros(1500, 90, 160, 40),
    workout_summary=None,
    weight_kg=72.4,
    streak_days=3,
)


def menu_setup(today: TodayResult | None = None, consented: bool = True):
    api, line = FakeApi(consented=consented, today=today), FakeLine()
    return TestClient(create_app(SETTINGS, api, line)), api, line


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


def test_today_without_profile_replies_profile_link() -> None:
    client, api, line = menu_setup(NO_PROFILE)
    post(client, [menu_postback("action=today")])
    assert [c[0] for c in api.calls] == ["sync", "today"]
    dumped = json.dumps(line.replies[0][1], ensure_ascii=False)
    assert "先完成個人檔案，我才能幫你算每天的目標。" in dumped
    assert "填寫個人檔案" in dumped
    assert "https://liff.line.me/1234-abcd/profile" in dumped


def test_today_with_profile_replies_flex_with_targets() -> None:
    client, api, line = menu_setup(WITH_PROFILE)
    post(client, [menu_postback("action=today")])
    msg = line.replies[0][1][0]
    assert msg["type"] == "flex"
    assert msg["altText"] == "今日總覽"
    dumped = json.dumps(msg, ensure_ascii=False)
    assert "1500 / 2200 kcal" in dumped
    assert "還能吃 700 kcal" in dumped
    assert "10 月 19 日・星期一" in dumped
    assert "今天還沒有訓練紀錄" in dumped
    assert "體重 72.4 kg" in dumped
    assert "已經連續記錄 3 天" in dumped
    assert "https://liff.line.me/1234-abcd/records" in dumped


def test_photo_and_ask_reply_coming_soon() -> None:
    client, _, line = menu_setup()
    post(client, [menu_postback("action=photo"), menu_postback("action=ask")])
    assert line.replies[0][1] == [{"type": "text", "text": "拍照記錄飲食即將開放，敬請期待！"}]
    assert line.replies[1][1] == [{"type": "text", "text": "問 AI 功能即將開放，敬請期待！"}]


def test_menu_before_consent_replies_welcome() -> None:
    client, api, line = menu_setup(WITH_PROFILE, consented=False)
    post(client, [menu_postback("action=today")])
    assert [c[0] for c in api.calls] == ["sync"]
    assert "我已滿 18 歲，同意並開始" in json.dumps(line.replies[0][1], ensure_ascii=False)


@pytest.mark.parametrize(
    "data",
    ["action=nope", "action=today&action=photo", "action=today&x=1", "x=today", "action=", ""],
)
def test_unknown_action_is_ignored(data) -> None:
    client, api, line = menu_setup(WITH_PROFILE)
    res = post(client, [menu_postback(data)])
    assert res.status_code == 200
    assert api.calls == []
    assert line.replies == []


def test_today_summary_is_valid_flex() -> None:
    from dataclasses import replace

    from linebot.v3.messaging import FlexMessage

    from app import messages

    over = replace(WITH_PROFILE, consumed=Macros(3000, 0, 999, 40))
    for t in (WITH_PROFILE, over):
        msg = messages.today_summary(t, "1234-abcd")
        FlexMessage.from_dict(msg)
        widths = [m for m in re.findall(r'"width": "(\d+)%"', json.dumps(msg))]
        assert widths and all(1 <= int(w) <= 100 for w in widths)
    assert '"width": "100%"' in json.dumps(messages.today_summary(over, "x"))


def _metric_setup(previous: dict[str, Any] | None = None, consented: bool = True):
    api, line = FakeApi(consented=consented, metric_previous=previous), FakeLine()
    return TestClient(create_app(SETTINGS, api, line)), api, line


def _reply_text(line: FakeLine) -> str:
    return line.replies[0][1][0]["text"]


def test_weight_command_records_and_replies_diff() -> None:
    client, api, line = _metric_setup({"value": 72.9, "date": "2026-10-14"})
    post(client, [text_event("體重 72.5")])
    assert ("record_metric", USER, "weightKg", 72.5) in api.calls
    assert _reply_text(line) == "已記錄體重 72.5 kg，比上次（10/14）少 0.4 kg。"


def test_heavier_than_last_says_more() -> None:
    client, _, line = _metric_setup({"value": 72.0, "date": "2026-10-14"})
    post(client, [text_event("體重 73")])
    assert _reply_text(line) == "已記錄體重 73 kg，比上次（10/14）多 1 kg。"


def test_first_weight_has_no_diff() -> None:
    client, _, line = _metric_setup(None)
    post(client, [text_event("體重 72.5")])
    assert _reply_text(line) == "已記錄體重 72.5 kg。"


def test_same_value_says_unchanged() -> None:
    client, _, line = _metric_setup({"value": 72.5, "date": "2026-10-14"})
    post(client, [text_event("體重 72.5")])
    assert _reply_text(line) == "已記錄體重 72.5 kg，和上次（10/14）一樣。"


def test_invalid_weight_replies_range_and_does_not_call_api() -> None:
    client, api, line = _metric_setup()
    post(client, [text_event("體重 7250")])
    assert [c[0] for c in api.calls] == ["sync"]
    assert (
        _reply_text(line) == "體重的數字好像不太對，請輸入 30–300 之間的數字，例如「體重 72.5」。"
    )
    assert "quickReply" in line.replies[0][1][0]


def test_non_command_text_keeps_placeholder() -> None:
    client, api, line = _metric_setup()
    post(client, [text_event("今天吃了雞腿便當")])
    assert [c[0] for c in api.calls] == ["sync"]
    assert line.replies[0][1] == [{"type": "text", "text": "收到！記錄功能下個版本就會開放。"}]


def test_command_before_consent_replies_welcome() -> None:
    client, api, line = _metric_setup(consented=False)
    post(client, [text_event("體重 72.5")])
    assert [c[0] for c in api.calls] == ["sync"]
    assert "我已滿 18 歲，同意並開始" in json.dumps(line.replies[0][1], ensure_ascii=False)


def test_reply_has_trend_quick_reply() -> None:
    client, _, line = _metric_setup(None)
    post(client, [text_event("腰圍 81 公分")])
    assert line.replies[0][1][0]["quickReply"] == {
        "items": [
            {
                "type": "action",
                "action": {
                    "type": "uri",
                    "label": "看趨勢",
                    "uri": "https://liff.line.me/1234-abcd/records/body",
                },
            }
        ]
    }
    assert _reply_text(line) == "已記錄腰圍 81 cm。"


def test_metric_reply_is_valid_for_the_line_sdk() -> None:
    from app import messages
    from app.line_replier import _to_sdk

    msg = messages.metric_range_error("bodyFatPct", "1234-abcd")
    assert _to_sdk(msg).to_dict()["quickReply"]["items"][0]["action"]["label"] == "看趨勢"
