import pytest

from app.meal_commands import MealPostback, MealText, parse_meal_postback, parse_meal_text

ID = "0b0e7c9e-3f55-4c0a-9a43-2d4a5f6c7d8e"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("午餐 雞腿便當 無糖豆漿", MealText("lunch", "雞腿便當 無糖豆漿")),
        ("宵夜：鹽酥雞", MealText("snack", "鹽酥雞")),
        ("點心:蘋果", MealText("snack", "蘋果")),
        ("早餐　蛋餅", MealText("breakfast", "蛋餅")),
        ("晚餐牛肉麵", MealText("dinner", "牛肉麵")),
        ("  午餐 便當  ", MealText("lunch", "便當")),
    ],
)
def test_parse_meal_text(text: str, expected: MealText) -> None:
    assert parse_meal_text(text) == expected


@pytest.mark.parametrize("text", ["午餐", "午餐   ", "午餐：", "我午餐吃便當", "體重 72", "你好"])
def test_parse_meal_text_rejects(text: str) -> None:
    assert parse_meal_text(text) is None


def test_parse_meal_text_length_limit() -> None:
    assert parse_meal_text("午餐 " + "飯" * 200) is not None
    assert parse_meal_text("午餐 " + "飯" * 201) is None


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (f"action=meal_confirm&id={ID}", MealPostback("meal_confirm", ID)),
        (f"action=meal_type_menu&id={ID}", MealPostback("meal_type_menu", ID)),
        (f"action=meal_type&id={ID}&type=dinner", MealPostback("meal_type", ID, "dinner")),
    ],
)
def test_parse_meal_postback(data: str, expected: MealPostback) -> None:
    assert parse_meal_postback(data) == expected


@pytest.mark.parametrize(
    "data",
    [
        "action=meal_confirm&id=abc",
        f"action=meal_type&id={ID}&type=brunch",
        f"action=meal_type&id={ID}",
        f"action=meal_confirm&id={ID}&type=lunch",
        f"action=meal_confirm&id={ID}&extra=1",
        f"action=meal_confirm&id={ID}&id={ID}",
        f"action=other&id={ID}",
        "action=today",
        "",
    ],
)
def test_parse_meal_postback_rejects(data: str) -> None:
    assert parse_meal_postback(data) is None
