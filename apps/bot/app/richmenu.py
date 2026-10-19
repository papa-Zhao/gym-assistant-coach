"""Create and publish the LINE rich menu.

Run by .github/workflows/richmenu.yml. Output is limited to step names and
HTTP status codes: never the token, response bodies or user data.
"""

import os
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from linebot.v3.messaging import (
    ApiClient,
    Configuration,
    MessagingApi,
    MessagingApiBlob,
    RichMenuRequest,
)
from linebot.v3.messaging.exceptions import ApiException

MENU_NAME = "gac-main-v1"
MENU_PREFIX = "gac-main-"
MAX_IMAGE_BYTES = 1_000_000

_COLUMNS = [(0, 833), (833, 834), (1667, 833)]
_ROWS = [(0, 843), (843, 843)]


def _uri(label: str, uri: str) -> dict[str, Any]:
    return {"type": "uri", "label": label, "uri": uri}


def _postback(label: str, data: str) -> dict[str, Any]:
    return {"type": "postback", "label": label, "data": data, "displayText": label}


def build_rich_menu(liff_id: str) -> dict[str, Any]:
    base = f"https://liff.line.me/{liff_id}"
    actions = [
        _uri("記訓練", f"{base}/workout"),
        _postback("拍餐點", "action=photo"),
        _postback("問 AI", "action=ask"),
        _postback("今日總覽", "action=today"),
        _uri("我的紀錄", f"{base}/records"),
        _uri("設定", f"{base}/settings"),
    ]
    cells = [(x, w, y, h) for y, h in _ROWS for x, w in _COLUMNS]
    return {
        "size": {"width": 2500, "height": 1686},
        "selected": True,
        "name": MENU_NAME,
        "chatBarText": "選單",
        "areas": [
            {"bounds": {"x": x, "y": y, "width": w, "height": h}, "action": action}
            for (x, w, y, h), action in zip(cells, actions, strict=True)
        ],
    }


def menus_to_delete(menus: list[dict[str, str]], keep_id: str) -> list[str]:
    return [m["id"] for m in menus if m["name"].startswith(MENU_PREFIX) and m["id"] != keep_id]


def _run_step(name: str, fn: Any) -> Any:
    try:
        result = fn()
    except ApiException as e:
        print(f"{name}: failed (HTTP {e.status})")
        raise
    except Exception as e:
        print(f"{name}: failed ({type(e).__name__})")
        raise
    print(f"{name}: ok")
    return result


def main(api: Any, blob: Any, env: Mapping[str, str]) -> int:
    image = Path(env["RICHMENU_IMAGE"]).read_bytes()
    if len(image) > MAX_IMAGE_BYTES:
        print(f"image is {len(image):,} bytes; LINE allows at most {MAX_IMAGE_BYTES:,}")
        return 1
    request = RichMenuRequest.from_dict(build_rich_menu(env["LIFF_ID"]))
    try:
        menu_id = _run_step("create_rich_menu", lambda: api.create_rich_menu(request)).rich_menu_id
        _run_step(
            "set_rich_menu_image",
            lambda: blob.set_rich_menu_image(
                menu_id, image, _headers={"Content-Type": "image/png"}
            ),
        )
        _run_step("set_default_rich_menu", lambda: api.set_default_rich_menu(menu_id))
        current = _run_step("get_default_rich_menu_id", api.get_default_rich_menu_id)
        if current.rich_menu_id != menu_id:
            print("default rich menu changed concurrently; skipping cleanup")
            return 0
        listing = _run_step("get_rich_menu_list", api.get_rich_menu_list)
        menus = [{"id": m.rich_menu_id, "name": m.name} for m in listing.richmenus]
        for old_id in menus_to_delete(menus, menu_id):
            _run_step("delete_rich_menu", lambda old_id=old_id: api.delete_rich_menu(old_id))
    except Exception:
        return 1
    return 0


if __name__ == "__main__":
    configuration = Configuration(access_token=os.environ["LINE_CHANNEL_ACCESS_TOKEN"])
    with ApiClient(configuration) as client:
        sys.exit(main(MessagingApi(client), MessagingApiBlob(client), os.environ))
