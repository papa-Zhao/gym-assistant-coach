from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.api_client import Macros, MetricRecorded, TodayResult
from app.commands import METRIC_LIMITS
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


def placeholder_reply() -> Message:
    return {"type": "text", "text": "收到！記錄功能下個版本就會開放。"}


def photo_coming_soon() -> Message:
    return {"type": "text", "text": "拍照記錄飲食即將開放，敬請期待！"}


def ask_coming_soon() -> Message:
    return {"type": "text", "text": "問 AI 功能即將開放，敬請期待！"}


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
