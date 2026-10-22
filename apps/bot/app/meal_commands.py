import re
import uuid
from dataclasses import dataclass
from urllib.parse import parse_qs

MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack")
MAX_MEAL_TEXT = 200

_PREFIXES = {
    "早餐": "breakfast",
    "午餐": "lunch",
    "晚餐": "dinner",
    "點心": "snack",
    "宵夜": "snack",
}
_MEAL_TEXT = re.compile(rf"^({'|'.join(_PREFIXES)})[\s:：]*(.*)$", re.DOTALL)


_QUESTION_LIKE = re.compile(r"吃什麼|推薦|建議|可以吃|要吃|嗎|呢|[?？]\s*$")


@dataclass(frozen=True)
class MealText:
    meal_type: str
    text: str


@dataclass(frozen=True)
class MealPostback:
    action: str  # meal_confirm | meal_type_menu | meal_type
    meal_id: str
    meal_type: str | None = None


def parse_meal_text(text: str) -> MealText | None:
    match = _MEAL_TEXT.match(text.strip())
    if match is None:
        return None
    content = match.group(2).strip()
    if not content or len(content) > MAX_MEAL_TEXT:
        return None
    return MealText(_PREFIXES[match.group(1)], content)


_FIELDS = {
    "meal_confirm": ["action", "id"],
    "meal_type_menu": ["action", "id"],
    "meal_type": ["action", "id", "type"],
}


def parse_meal_postback(data: str) -> MealPostback | None:
    fields = parse_qs(data)
    if any(len(values) != 1 for values in fields.values()):
        return None
    action = fields.get("action", [""])[0]
    if action not in _FIELDS or sorted(fields) != sorted(_FIELDS[action]):
        return None
    meal_id = fields["id"][0]
    try:
        if str(uuid.UUID(meal_id)) != meal_id.lower():
            return None
    except ValueError:
        return None
    meal_type = fields["type"][0] if action == "meal_type" else None
    if action == "meal_type" and meal_type not in MEAL_TYPES:
        return None
    return MealPostback(action, meal_id.lower(), meal_type)


def parse_meal_log(text: str) -> MealText | None:
    """A meal log: meal-prefixed text whose content is not a question for the AI."""
    meal = parse_meal_text(text)
    if meal is None or _QUESTION_LIKE.search(meal.text):
        return None
    return meal
