from typing import Any

from app.settings import CONSENT_VERSION

PRIMARY = "#B4492A"
SURFACE = "#FFFDF8"
TEXT = "#2B2420"
MUTED = "#6B5E55"

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
                            "uri": f"https://liff.line.me/{liff_id}",
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
