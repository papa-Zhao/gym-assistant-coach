import json

from linebot.v3.messaging import FlexMessage

from app import messages
from app.api_client import Advice, AdviceItem, Macros, Meal, MealConfirmed, MealItem
from app.line_replier import _to_sdk


def test_consent_done_links_profile_path() -> None:
    uri = messages.consent_done("1234-abcd")["contents"]["footer"]["contents"][0]["action"]["uri"]
    assert uri == "https://liff.line.me/1234-abcd/profile"


def _meal(n_items: int = 2, status: str = "draft") -> Meal:
    return Meal(
        id="m-1",
        meal_type="lunch",
        status=status,
        items=[MealItem(f"食物{i}", 100.0 + i, 200 + i) for i in range(n_items)],
        total_kcal=500,
        total_protein_g=31.5,
    )


def test_meal_draft_has_three_buttons() -> None:
    card = messages.meal_draft(_meal(3), "1234-abcd")
    buttons = card["contents"]["footer"]["contents"]
    assert [b["action"]["label"] for b in buttons] == ["✅ 確認記錄", "✏️ 修改", "🍽 換餐別"]
    assert buttons[0]["action"]["data"] == "action=meal_confirm&id=m-1"
    assert buttons[1]["action"]["uri"] == "https://liff.line.me/1234-abcd/meal?id=m-1"
    assert buttons[2]["action"]["data"] == "action=meal_type_menu&id=m-1"
    text = json.dumps(card, ensure_ascii=False)
    assert "午餐・AI 估計" in text
    assert "數值為 AI 估計，可按修改調整" in text
    assert "合計 500 kcal" in text
    assert "蛋白質 31.5 g" in text
    rows = card["contents"]["body"]["contents"][1]["contents"]
    assert len(rows) == 3
    assert isinstance(_to_sdk(card), FlexMessage)


def test_meal_confirmed_texts() -> None:
    def confirmed(consumed: int, target: int | None) -> MealConfirmed:
        return MealConfirmed(
            meal=_meal(),
            consumed=Macros(consumed, 0, 0, 0),
            targets=Macros(target, 0, 0, 0) if target is not None else None,
        )

    assert messages.meal_confirmed(confirmed(1500, 2200), "x")["text"] == (
        "已記錄！今日已攝取 1500 kcal，還剩 700 kcal"
    )
    assert messages.meal_confirmed(confirmed(2300, 2200), "x")["text"] == (
        "已記錄！今日已攝取 2300 kcal，已超過 100 kcal"
    )
    no_target = messages.meal_confirmed(confirmed(900, None), "x")
    assert no_target["text"] == "已記錄！今日已攝取 900 kcal"
    assert "還剩" not in no_target["text"]
    assert no_target["quickReply"]["items"][0]["action"]["label"] == "看今日總覽"


def test_meal_type_menu_has_four_quick_replies() -> None:
    items = messages.meal_type_menu("m-1")["quickReply"]["items"]
    assert [i["action"]["data"] for i in items] == [
        f"action=meal_type&id=m-1&type={t}" for t in ("breakfast", "lunch", "dinner", "snack")
    ]


def test_meal_type_changed() -> None:
    assert messages.meal_type_changed(_meal(), "x")["type"] == "flex"
    assert messages.meal_type_changed(_meal(status="confirmed"), "x") == {
        "type": "text",
        "text": "已改成午餐",
    }


def test_photo_prompt_has_camera_and_camera_roll_quick_replies() -> None:
    msg = messages.photo_prompt()
    assert msg["text"] == "直接在聊天室傳一張餐點照片，我會幫你估算熱量。"
    actions = [i["action"] for i in msg["quickReply"]["items"]]
    assert actions == [
        {"type": "camera", "label": "拍照"},
        {"type": "cameraRoll", "label": "從相簿選"},
    ]
    assert _to_sdk(msg).to_dict()["quickReply"]["items"][0]["action"]["type"] == "camera"


def test_meal_photo_outcome_covers_all_outcomes() -> None:
    outcomes = ["invalid_image", "limit", "not_food", "refused", "unavailable"]
    for outcome in outcomes:
        assert messages.meal_photo_outcome(outcome)["type"] == "text"
    assert messages.meal_photo_outcome("limit")["text"] != messages.meal_outcome("limit")["text"]
    assert (
        messages.meal_photo_outcome("not_food")["text"]
        != (messages.meal_outcome("not_food")["text"])
    )
    assert messages.meal_photo_outcome("refused") == messages.meal_outcome("refused")
    assert messages.meal_photo_outcome("unavailable") == messages.meal_outcome("unavailable")
    assert (
        messages.meal_photo_outcome("invalid_image")["text"] == "這張照片沒辦法讀取，請換一張再試。"
    )
    assert messages.MEAL_PHOTO_MAX_BYTES == 10 * 1024 * 1024


def _advice(items: int = 3, today_line: str | None = "今天還能吃 700 kcal") -> Advice:
    return Advice(
        title="晚餐建議",
        items=[AdviceItem(f"選項{i}", f"說明{i}") for i in range(items)],
        body="先吃蛋白質。",
        today_line=today_line,
        notices=["提醒一", "提醒二"],
    )


def test_advice_card_content() -> None:
    card = messages.advice_card(_advice())
    assert card["type"] == "flex"
    assert card["altText"] == "晚餐建議"
    dumped = json.dumps(card, ensure_ascii=False)
    for text in ("今天還能吃 700 kcal", "晚餐建議", "先吃蛋白質。", "提醒一", "提醒二"):
        assert text in dumped
    for i in range(3):
        assert f"選項{i}" in dumped
        assert f"說明{i}" in dumped
    assert messages.DISCLAIMER == "AI 建議僅供參考，不能取代醫師或營養師的專業意見。"
    assert messages.DISCLAIMER in dumped
    body = card["contents"]["body"]["contents"]
    assert body[0]["text"] == "今天還能吃 700 kcal"
    assert body[1]["text"] == "晚餐建議"
    assert body[-1]["text"] == messages.DISCLAIMER
    button = card["contents"]["footer"]["contents"][0]
    assert button["action"] == {
        "type": "postback",
        "label": "再問一個問題",
        "data": "action=ask",
        "displayText": "再問一個問題",
    }


def test_advice_card_without_today_line() -> None:
    card = messages.advice_card(_advice(today_line=None))
    body = card["contents"]["body"]["contents"]
    assert body[0]["text"] == "晚餐建議"
    assert "今天還能吃" not in json.dumps(card, ensure_ascii=False)


def test_advice_card_without_items_has_no_item_block() -> None:
    with_items = messages.advice_card(_advice(items=2))["contents"]["body"]["contents"]
    without = messages.advice_card(_advice(items=0))["contents"]["body"]["contents"]
    assert len(with_items) == len(without) + 1
    assert all(b.get("backgroundColor") != messages.SURFACE_ALT for b in without)


def test_advice_card_is_json_and_valid_flex() -> None:
    card = messages.advice_card(_advice())
    json.dumps(card)
    assert isinstance(_to_sdk(card), FlexMessage)


def test_ask_menu_has_three_message_quick_replies() -> None:
    menu = messages.ask_menu()
    assert menu["text"] == "想問什麼？直接打字問我，或選一個常見問題。"
    actions = [i["action"] for i in menu["quickReply"]["items"]]
    assert [a["type"] for a in actions] == ["message"] * 3
    assert [a["text"] for a in actions] == ["今天練什麼", "晚餐吃什麼", "幫我排一週課表"]
    assert [a["label"] for a in actions] == ["今天練什麼", "晚餐吃什麼", "幫我排一週課表"]


def test_ask_outcome_and_fixed_texts() -> None:
    assert (
        messages.ask_outcome("limit")["text"]
        == "今天的 AI 提問次數（20 次）用完了，明天再來問我吧！"
    )
    assert messages.ask_outcome("refused")["text"] == "這個問題我沒辦法回答，換個方式問問看？"
    assert messages.ask_outcome("unavailable") == messages.meal_outcome("unavailable")
    assert messages.ask_too_long()["text"] == "問題有點長，請精簡到 500 字以內再問一次。"
    assert messages.conversation_reset()["text"] == "好，我們重新開始，之前的對話不會再當作參考。"
    assert messages.ASK_MAX_CHARS == 500


def _texts(node: object) -> list[str]:
    if isinstance(node, dict):
        found = [node["text"]] if node.get("type") == "text" else []
        return found + [t for v in node.values() for t in _texts(v)]
    if isinstance(node, list):
        return [t for v in node for t in _texts(v)]
    return []


def test_advice_card_skips_blank_text_components() -> None:
    advice = Advice(
        title=" ",
        items=[AdviceItem("雞胸沙拉", ""), AdviceItem("燕麥", "  ")],
        body="",
        today_line=" ",
        notices=["", "  ", "提醒"],
    )
    card = messages.advice_card(advice)
    texts = _texts(card["contents"])
    assert all(t.strip() for t in texts)
    assert "雞胸沙拉" in texts
    assert "提醒" in texts
    assert card["altText"] == "AI 建議"
    assert isinstance(_to_sdk(card), FlexMessage)
