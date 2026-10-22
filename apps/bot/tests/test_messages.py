import json

from linebot.v3.messaging import FlexMessage

from app import messages
from app.api_client import Macros, Meal, MealConfirmed, MealItem
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
