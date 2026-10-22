from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.api_client import (
    Advice,
    Macros,
    Meal,
    MealConfirmed,
    MetricRecorded,
    Program,
    TodayResult,
    WorkoutSummary,
)
from app.commands import METRIC_LIMITS
from app.program_commands import program_save_data
from app.settings import CONSENT_VERSION

PRIMARY = "#B4492A"
SURFACE = "#FFFDF8"
TEXT = "#2B2420"
MUTED = "#6B5E55"
SURFACE_ALT = "#F1E8DB"
ACCENT = "#5B6B3A"
ACCENT_SOFT = "#EEF0E4"
ON_ACCENT_SOFT = "#3E4A26"

Message = dict[str, Any]

CONSENT_POSTBACK_DATA = f"action=consent&version={CONSENT_VERSION}"


def welcome(public_site_url: str) -> Message:
    def link(label: str, path: str) -> dict[str, Any]:
        return {
            "type": "text",
            "text": label,
            "color": PRIMARY,
            "size": "sm",
            "decoration": "underline",
            "action": {"type": "uri", "label": label, "uri": f"{public_site_url}/{path}"},
        }

    return {
        "type": "flex",
        "altText": "歡迎使用 Gym Assistant Coach",
        "contents": {
            "type": "bubble",
            "styles": {
                "body": {"backgroundColor": SURFACE},
                "footer": {"backgroundColor": SURFACE},
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "spacing": "md",
                "contents": [
                    {
                        "type": "text",
                        "text": "歡迎使用 Gym Assistant Coach",
                        "weight": "bold",
                        "size": "lg",
                        "color": TEXT,
                        "wrap": True,
                    },
                    {
                        "type": "text",
                        "text": (
                            "我可以幫你記錄訓練、拍照記飲食，也能依你的資料給建議。"
                            "開始前請先閱讀並同意以下文件。"
                        ),
                        "size": "sm",
                        "color": MUTED,
                        "wrap": True,
                    },
                    link("服務條款", "terms.html"),
                    link("隱私權政策", "privacy.html"),
                ],
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "color": PRIMARY,
                        "height": "md",
                        "action": {
                            "type": "postback",
                            "label": "我已滿 18 歲，同意並開始",
                            "data": CONSENT_POSTBACK_DATA,
                        },
                    }
                ],
            },
        },
    }


def consent_done(liff_id: str) -> Message:
    return {
        "type": "flex",
        "altText": "謝謝！最後一步：填寫個人檔案，我才能幫你算每天的目標。",
        "contents": {
            "type": "bubble",
            "styles": {
                "body": {"backgroundColor": SURFACE},
                "footer": {"backgroundColor": SURFACE},
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "謝謝！最後一步：填寫個人檔案，我才能幫你算每天的目標。",
                        "color": TEXT,
                        "wrap": True,
                    }
                ],
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "color": PRIMARY,
                        "height": "md",
                        "action": {
                            "type": "uri",
                            "label": "開始設定",
                            "uri": f"https://liff.line.me/{liff_id}/profile",
                        },
                    }
                ],
            },
        },
    }


def welcome_back() -> Message:
    return {"type": "text", "text": "歡迎回來！你的紀錄都還在。"}


def photo_prompt() -> Message:
    return {
        "type": "text",
        "text": "直接在聊天室傳一張餐點照片，我會幫你估算熱量。",
        "quickReply": {
            "items": [
                {"type": "action", "action": {"type": "camera", "label": "拍照"}},
                {"type": "action", "action": {"type": "cameraRoll", "label": "從相簿選"}},
            ]
        },
    }


def profile_needed(liff_id: str) -> Message:
    text = "先完成個人檔案，我才能幫你算每天的目標。"
    return {
        "type": "flex",
        "altText": text,
        "contents": {
            "type": "bubble",
            "styles": {
                "body": {"backgroundColor": SURFACE},
                "footer": {"backgroundColor": SURFACE},
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [{"type": "text", "text": text, "color": TEXT, "wrap": True}],
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "color": PRIMARY,
                        "height": "md",
                        "action": {
                            "type": "uri",
                            "label": "填寫個人檔案",
                            "uri": f"https://liff.line.me/{liff_id}/profile",
                        },
                    }
                ],
            },
        },
    }


_WEEKDAYS = "日一二三四五六"


def _date_line(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d.month} 月 {d.day} 日・星期{_WEEKDAYS[(d.weekday() + 1) % 7]}"


def _bar_width(consumed: int, target: int) -> str:
    if target <= 0:
        return "1%"
    pct = max(1, min(100, round(consumed / target * 100)))
    return f"{pct}%"


def _bar(consumed: int, target: int) -> dict[str, Any]:
    return {
        "type": "box",
        "layout": "horizontal",
        "height": "8px",
        "cornerRadius": "4px",
        "backgroundColor": SURFACE_ALT,
        "contents": [
            {
                "type": "box",
                "layout": "vertical",
                "width": _bar_width(consumed, target),
                "backgroundColor": ACCENT,
                "cornerRadius": "4px",
                "contents": [],
            }
        ],
    }


def _row(label: str, value: str, consumed: int, target: int) -> dict[str, Any]:
    return {
        "type": "box",
        "layout": "vertical",
        "spacing": "xs",
        "contents": [
            {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {"type": "text", "text": label, "size": "sm", "color": TEXT},
                    {
                        "type": "text",
                        "text": value,
                        "size": "sm",
                        "color": MUTED,
                        "align": "end",
                    },
                ],
            },
            _bar(consumed, target),
        ],
    }


def today_summary(t: TodayResult, liff_id: str) -> Message:
    targets: Macros = t.targets or Macros(0, 0, 0, 0)
    c = t.consumed
    remaining = max(0, targets.kcal - c.kcal)
    box_lines: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": t.workout_summary or "今天還沒有訓練紀錄",
            "size": "sm",
            "color": ON_ACCENT_SOFT,
            "wrap": True,
        }
    ]
    if t.weight_kg is not None:
        box_lines.append(
            {
                "type": "text",
                "text": f"體重 {t.weight_kg:g} kg",
                "size": "sm",
                "color": ON_ACCENT_SOFT,
            }
        )
    return {
        "type": "flex",
        "altText": "今日總覽",
        "contents": {
            "type": "bubble",
            "styles": {
                "body": {"backgroundColor": SURFACE},
                "footer": {"backgroundColor": SURFACE},
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "spacing": "md",
                "contents": [
                    {
                        "type": "text",
                        "text": _date_line(t.date),
                        "size": "xs",
                        "color": MUTED,
                    },
                    {
                        "type": "text",
                        "text": "今日總覽",
                        "weight": "bold",
                        "size": "xl",
                        "color": TEXT,
                    },
                    _row("熱量", f"{c.kcal} / {targets.kcal} kcal", c.kcal, targets.kcal),
                    {
                        "type": "text",
                        "text": f"還能吃 {remaining} kcal",
                        "size": "sm",
                        "weight": "bold",
                        "color": PRIMARY,
                    },
                    _row(
                        "蛋白質",
                        f"{c.protein_g} / {targets.protein_g} g",
                        c.protein_g,
                        targets.protein_g,
                    ),
                    _row("碳水", f"{c.carb_g} / {targets.carb_g} g", c.carb_g, targets.carb_g),
                    _row("脂肪", f"{c.fat_g} / {targets.fat_g} g", c.fat_g, targets.fat_g),
                    {
                        "type": "box",
                        "layout": "vertical",
                        "spacing": "xs",
                        "backgroundColor": ACCENT_SOFT,
                        "cornerRadius": "8px",
                        "paddingAll": "12px",
                        "contents": box_lines,
                    },
                    {
                        "type": "text",
                        "text": f"已經連續記錄 {t.streak_days} 天",
                        "size": "sm",
                        "color": MUTED,
                    },
                ],
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "color": PRIMARY,
                        "height": "md",
                        "action": {
                            "type": "uri",
                            "label": "看看這週",
                            "uri": f"https://liff.line.me/{liff_id}/records",
                        },
                    }
                ],
            },
        },
    }


_METRIC_LABELS = {
    "weightKg": ("體重", "kg", "72.5"),
    "bodyFatPct": ("體脂", "%", "18.6"),
    "waistCm": ("腰圍", "cm", "81"),
}


def _num(value: float | Decimal) -> str:
    one = Decimal(str(value)).quantize(Decimal("0.1"), ROUND_HALF_UP)
    return str(one.quantize(Decimal("1"))) if one == one.to_integral_value() else str(one)


def _with_trend_quick_reply(text: str, liff_id: str) -> Message:
    return {
        "type": "text",
        "text": text,
        "quickReply": {
            "items": [
                {
                    "type": "action",
                    "action": {
                        "type": "uri",
                        "label": "看趨勢",
                        "uri": f"https://liff.line.me/{liff_id}/records/body",
                    },
                }
            ]
        },
    }


def metric_recorded(result: MetricRecorded, liff_id: str) -> Message:
    label, unit, _ = _METRIC_LABELS[result.key]
    text = f"已記錄{label} {_num(result.value)} {unit}"
    prev = result.previous
    if prev is None:
        text += "。"
    else:
        d = date.fromisoformat(prev.date)
        when = f"{d.month}/{d.day}"
        diff = Decimal(str(result.value)) - Decimal(str(prev.value))
        diff = diff.quantize(Decimal("0.1"), ROUND_HALF_UP)
        if diff == 0:
            text += f"，和上次（{when}）一樣。"
        else:
            word = "多" if diff > 0 else "少"
            text += f"，比上次（{when}）{word} {_num(abs(diff))} {unit}。"
    return _with_trend_quick_reply(text, liff_id)


def metric_range_error(key: str, liff_id: str) -> Message:
    label, _, example = _METRIC_LABELS[key]
    low, high = METRIC_LIMITS[key]
    text = f"{label}的數字好像不太對，請輸入 {low}–{high} 之間的數字，例如「{label} {example}」。"
    return _with_trend_quick_reply(text, liff_id)


def _volume(kg: float) -> str:
    return f"{int(Decimal(str(kg)).quantize(Decimal('1'), ROUND_HALF_UP)):,}"


def workout_done(summary: WorkoutSummary, template_name: str | None, liff_id: str) -> Message:
    stats = [f"{summary.exercise_count} 個動作"]
    if summary.set_count > 0:
        stats.append(f"{summary.set_count} 組")
        stats.append(f"總訓練量 {_volume(summary.volume_kg)} kg")
    if summary.cardio_minutes > 0:
        stats.append(f"有氧 {_num(summary.cardio_minutes)} 分鐘")
    body: list[dict[str, Any]] = [
        {"type": "text", "text": "今天辛苦了！", "weight": "bold", "size": "xl", "color": TEXT},
        {"type": "text", "text": template_name or "訓練", "size": "sm", "color": MUTED},
        {
            "type": "box",
            "layout": "vertical",
            "spacing": "xs",
            "contents": [
                {"type": "text", "text": line, "size": "sm", "color": TEXT, "wrap": True}
                for line in stats
            ],
        },
    ]
    for pr in summary.prs:
        text = (
            f"新紀錄：{pr.name_zh} 估算 1RM {_num(pr.e1rm)} kg"
            f"（{_num(pr.weight_kg)} kg × {pr.reps}）"
        )
        body.append(
            {
                "type": "box",
                "layout": "vertical",
                "backgroundColor": ACCENT_SOFT,
                "cornerRadius": "8px",
                "paddingAll": "12px",
                "contents": [
                    {
                        "type": "text",
                        "text": text,
                        "size": "sm",
                        "weight": "bold",
                        "color": ON_ACCENT_SOFT,
                        "wrap": True,
                    }
                ],
            }
        )
    return {
        "type": "flex",
        "altText": "訓練完成",
        "contents": {
            "type": "bubble",
            "styles": {
                "body": {"backgroundColor": SURFACE},
                "footer": {"backgroundColor": SURFACE},
            },
            "body": {"type": "box", "layout": "vertical", "spacing": "md", "contents": body},
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "color": PRIMARY,
                        "height": "md",
                        "action": {
                            "type": "postback",
                            "label": "看今天的總覽",
                            "data": "action=today",
                            "displayText": "今日總覽",
                        },
                    }
                ],
            },
        },
    }


MEAL_LABELS = {"breakfast": "早餐", "lunch": "午餐", "dinner": "晚餐", "snack": "點心"}


def _meal_item_row(name: str, grams: float, kcal: int) -> dict[str, Any]:
    return {
        "type": "box",
        "layout": "horizontal",
        "spacing": "sm",
        "contents": [
            {
                "type": "text",
                "text": f"{name} {_num(grams)} g",
                "size": "sm",
                "color": TEXT,
                "wrap": True,
                "flex": 3,
            },
            {
                "type": "text",
                "text": f"{kcal} kcal",
                "size": "sm",
                "color": MUTED,
                "align": "end",
                "flex": 1,
            },
        ],
    }


def meal_draft(meal: Meal, liff_id: str) -> Message:
    label = MEAL_LABELS[meal.meal_type]
    title = f"{label}・AI 估計"
    return {
        "type": "flex",
        "altText": f"{title}：共 {meal.total_kcal} kcal",
        "contents": {
            "type": "bubble",
            "styles": {
                "body": {"backgroundColor": SURFACE},
                "footer": {"backgroundColor": SURFACE},
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "spacing": "md",
                "contents": [
                    {
                        "type": "text",
                        "text": title,
                        "weight": "bold",
                        "size": "xl",
                        "color": TEXT,
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "spacing": "sm",
                        "contents": [_meal_item_row(i.name, i.grams, i.kcal) for i in meal.items],
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "spacing": "xs",
                        "backgroundColor": ACCENT_SOFT,
                        "cornerRadius": "8px",
                        "paddingAll": "12px",
                        "contents": [
                            {
                                "type": "text",
                                "text": f"合計 {meal.total_kcal} kcal",
                                "size": "sm",
                                "weight": "bold",
                                "color": ON_ACCENT_SOFT,
                            },
                            {
                                "type": "text",
                                "text": f"蛋白質 {_num(meal.total_protein_g)} g",
                                "size": "sm",
                                "color": ON_ACCENT_SOFT,
                            },
                        ],
                    },
                    {
                        "type": "text",
                        "text": "數值為 AI 估計，可按修改調整",
                        "size": "xs",
                        "color": MUTED,
                        "wrap": True,
                    },
                ],
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "color": PRIMARY,
                        "height": "md",
                        "action": {
                            "type": "postback",
                            "label": "✅ 確認記錄",
                            "data": f"action=meal_confirm&id={meal.id}",
                        },
                    },
                    {
                        "type": "button",
                        "style": "secondary",
                        "height": "md",
                        "action": {
                            "type": "uri",
                            "label": "✏️ 修改",
                            "uri": f"https://liff.line.me/{liff_id}/meal?id={meal.id}",
                        },
                    },
                    {
                        "type": "button",
                        "style": "secondary",
                        "height": "md",
                        "action": {
                            "type": "postback",
                            "label": "🍽 換餐別",
                            "data": f"action=meal_type_menu&id={meal.id}",
                        },
                    },
                ],
            },
        },
    }


def meal_confirmed(confirmed: MealConfirmed, liff_id: str) -> Message:
    text = f"已記錄！今日已攝取 {confirmed.consumed.kcal} kcal"
    if confirmed.targets is not None:
        left = confirmed.targets.kcal - confirmed.consumed.kcal
        text += f"，還剩 {left} kcal" if left >= 0 else f"，已超過 {-left} kcal"
    return {
        "type": "text",
        "text": text,
        "quickReply": {
            "items": [
                {
                    "type": "action",
                    "action": {
                        "type": "postback",
                        "label": "看今日總覽",
                        "data": "action=today",
                        "displayText": "今日總覽",
                    },
                }
            ]
        },
    }


def meal_type_menu(meal_id: str) -> Message:
    return {
        "type": "text",
        "text": "要換成哪一餐？",
        "quickReply": {
            "items": [
                {
                    "type": "action",
                    "action": {
                        "type": "postback",
                        "label": label,
                        "data": f"action=meal_type&id={meal_id}&type={key}",
                        "displayText": label,
                    },
                }
                for key, label in MEAL_LABELS.items()
            ]
        },
    }


def meal_type_changed(meal: Meal, liff_id: str) -> Message:
    if meal.status == "confirmed":
        return {"type": "text", "text": f"已改成{MEAL_LABELS[meal.meal_type]}"}
    return meal_draft(meal, liff_id)


MEAL_OUTCOME_TEXT = {
    "limit": "今天的文字記錄次數用完了，明天再試。",
    "not_food": "看不太出吃了什麼，可以寫得更具體一點，例如「午餐 雞腿便當 無糖豆漿」。",
    "refused": "這則內容沒辦法處理，換個說法再試試。",
    "unavailable": "AI 暫時忙不過來，請稍後再試。",
}


def meal_outcome(outcome: str) -> Message:
    return {"type": "text", "text": MEAL_OUTCOME_TEXT[outcome]}


def meal_not_found() -> Message:
    return {"type": "text", "text": "找不到這一餐，可能已經刪除了。"}


# Largest original the bot forwards to the api; the api enforces the same cap.
MEAL_PHOTO_MAX_BYTES = 10 * 1024 * 1024

MEAL_PHOTO_OUTCOME_TEXT = {
    **MEAL_OUTCOME_TEXT,
    "limit": "今天的照片辨識次數用完了，明天再試，或改用文字記錄，例如「午餐 雞腿便當」。",
    "not_food": "這張照片看不太出是什麼食物，可以換一張清楚一點的，或改用文字記錄。",
    "invalid_image": "這張照片沒辦法讀取，請換一張再試。",
}


def meal_photo_outcome(outcome: str) -> Message:
    return {"type": "text", "text": MEAL_PHOTO_OUTCOME_TEXT[outcome]}


ASK_MAX_CHARS = 500
ASK_QUICK_QUESTIONS = ("今天練什麼", "晚餐吃什麼", "幫我排一週課表")
DISCLAIMER = "AI 建議僅供參考，不能取代醫師或營養師的專業意見。"

ASK_OUTCOME_TEXT = {
    "limit": "今天的 AI 提問次數（20 次）用完了，明天再來問我吧！",
    "refused": "這個問題我沒辦法回答，換個方式問問看？",
    "unavailable": MEAL_OUTCOME_TEXT["unavailable"],
}


def ask_menu() -> Message:
    return {
        "type": "text",
        "text": "想問什麼？直接打字問我，或選一個常見問題。",
        "quickReply": {
            "items": [
                {
                    "type": "action",
                    "action": {"type": "message", "label": question, "text": question},
                }
                for question in ASK_QUICK_QUESTIONS
            ]
        },
    }


def ask_outcome(outcome: str) -> Message:
    return {"type": "text", "text": ASK_OUTCOME_TEXT[outcome]}


def ask_too_long() -> Message:
    return {"type": "text", "text": f"問題有點長，請精簡到 {ASK_MAX_CHARS} 字以內再問一次。"}


def conversation_reset() -> Message:
    return {"type": "text", "text": "好，我們重新開始，之前的對話不會再當作參考。"}


def _advice_item_block(name: str, detail: str) -> dict[str, Any]:
    # LINE rejects Flex text components with empty text, so a blank detail is left out.
    texts: list[dict[str, Any]] = [
        {"type": "text", "text": name, "size": "sm", "weight": "bold", "color": TEXT, "wrap": True}
    ]
    if detail.strip():
        texts.append({"type": "text", "text": detail, "size": "xs", "color": MUTED, "wrap": True})
    return {
        "type": "box",
        "layout": "vertical",
        "spacing": "xs",
        "backgroundColor": SURFACE_ALT,
        "cornerRadius": "8px",
        "paddingAll": "12px",
        "contents": texts,
    }


def _advice_bubble(advice: Advice) -> tuple[str, dict[str, Any]]:
    title = advice.title.strip() or "AI 建議"
    body: list[dict[str, Any]] = []
    if advice.today_line is not None and advice.today_line.strip():
        body.append(
            {"type": "text", "text": advice.today_line, "size": "xs", "color": MUTED, "wrap": True}
        )
    body.append(
        {
            "type": "text",
            "text": title,
            "weight": "bold",
            "size": "xl",
            "color": TEXT,
            "wrap": True,
        }
    )
    if advice.items:
        body.append(
            {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "contents": [_advice_item_block(i.name, i.detail) for i in advice.items],
            }
        )
    if advice.body.strip():
        body.append(
            {"type": "text", "text": advice.body, "size": "sm", "color": TEXT, "wrap": True}
        )
    body.extend(
        {"type": "text", "text": notice, "size": "xs", "color": PRIMARY, "wrap": True}
        for notice in advice.notices
        if notice.strip()
    )
    body.append({"type": "separator"})
    body.append({"type": "text", "text": DISCLAIMER, "size": "xs", "color": MUTED, "wrap": True})
    return title, {
        "type": "bubble",
        "styles": {
            "body": {"backgroundColor": SURFACE},
            "footer": {"backgroundColor": SURFACE},
        },
        "body": {"type": "box", "layout": "vertical", "spacing": "md", "contents": body},
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "style": "secondary",
                    "height": "md",
                    "action": {
                        "type": "postback",
                        "label": "再問一個問題",
                        "data": "action=ask",
                        "displayText": "再問一個問題",
                    },
                }
            ],
        },
    }


MAX_CAROUSEL_BUBBLES = 12


def _program_day_bubble(program: Program, number: int) -> dict[str, Any]:
    day = program.days[number - 1]
    fallback = f"第 {number} 天"
    name = day.name.strip() or fallback
    lines = [
        {
            "type": "text",
            "text": f"{item.name} {item.sets}×{item.reps}",
            "size": "sm",
            "color": TEXT,
            "wrap": True,
        }
        for item in day.items
        if item.name.strip()
    ]
    return {
        "type": "bubble",
        "styles": {"body": {"backgroundColor": SURFACE}, "footer": {"backgroundColor": SURFACE}},
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "contents": [
                {"type": "text", "text": fallback, "size": "xs", "color": MUTED},
                {
                    "type": "text",
                    "text": name,
                    "weight": "bold",
                    "size": "lg",
                    "color": TEXT,
                    "wrap": True,
                },
                *lines,
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "color": PRIMARY,
                    "height": "md",
                    "action": {
                        "type": "postback",
                        "label": "存成範本",
                        "data": program_save_data(program.id, number),
                        "displayText": f"存成範本：{name}",
                    },
                }
            ],
        },
    }


def advice_card(advice: Advice) -> Message:
    title, bubble = _advice_bubble(advice)
    program = advice.program
    if program is None or not program.days:
        return {"type": "flex", "altText": title, "contents": bubble}
    days = [
        _program_day_bubble(program, n)
        for n in range(1, min(len(program.days), MAX_CAROUSEL_BUBBLES - 1, 7) + 1)
    ]
    return {
        "type": "flex",
        "altText": title,
        "contents": {"type": "carousel", "contents": [bubble, *days]},
    }


def program_saved(name: str) -> Message:
    return {"type": "text", "text": f"「{name}」範本已經儲存"}


def program_already_saved(name: str) -> Message:
    return {"type": "text", "text": f"「{name}」範本已經存過了"}


def program_expired() -> Message:
    return {"type": "text", "text": "這份課表已過期，請重新問 AI。"}
