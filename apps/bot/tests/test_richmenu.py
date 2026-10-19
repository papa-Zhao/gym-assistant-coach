from types import SimpleNamespace

import pytest

from app.richmenu import build_rich_menu, main, menus_to_delete

LIFF = "1234-abcd"
TOKEN = "super-secret-token-value"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def _areas() -> list[dict]:
    return build_rich_menu(LIFF)["areas"]


def test_areas_cover_grid_without_overlap():
    menu = build_rich_menu(LIFF)
    assert menu["size"] == {"width": 2500, "height": 1686}
    assert menu["selected"] is True
    assert menu["name"] == "gac-main-v1"
    assert menu["chatBarText"] == "選單"
    bounds = [a["bounds"] for a in menu["areas"]]
    assert len(bounds) == 6
    assert [(b["x"], b["width"]) for b in bounds[:3]] == [(0, 833), (833, 834), (1667, 833)]
    assert [(b["y"], b["height"]) for b in bounds[::3]] == [(0, 843), (843, 843)]
    # every pixel covered exactly once
    covered = sum(b["width"] * b["height"] for b in bounds)
    assert covered == 2500 * 1686
    for i, a in enumerate(bounds):
        for b in bounds[i + 1 :]:
            separated = (
                a["x"] + a["width"] <= b["x"]
                or b["x"] + b["width"] <= a["x"]
                or a["y"] + a["height"] <= b["y"]
                or b["y"] + b["height"] <= a["y"]
            )
            assert separated


def test_actions_match_design():
    base = f"https://liff.line.me/{LIFF}"
    got = [
        (a["action"]["label"], a["action"]["type"], a["action"].get("uri") or a["action"]["data"])
        for a in _areas()
    ]
    assert got == [
        ("記訓練", "uri", f"{base}/workout"),
        ("拍餐點", "postback", "action=photo"),
        ("問 AI", "postback", "action=ask"),
        ("今日總覽", "postback", "action=today"),
        ("我的紀錄", "uri", f"{base}/records"),
        ("設定", "uri", f"{base}/settings"),
    ]


def test_postbacks_have_display_text():
    texts = {
        a["action"]["data"]: a["action"]["displayText"]
        for a in _areas()
        if a["action"]["type"] == "postback"
    }
    assert texts == {
        "action=photo": "拍餐點",
        "action=ask": "問 AI",
        "action=today": "今日總覽",
    }


def test_old_menus_selected_for_deletion():
    menus = [
        {"id": "new", "name": "gac-main-v1"},
        {"id": "old1", "name": "gac-main-v0"},
        {"id": "old2", "name": "gac-main-v1"},
        {"id": "other", "name": "someone-else"},
    ]
    assert menus_to_delete(menus, "new") == ["old1", "old2"]


class FakeApi:
    def __init__(self, fail_at: str | None = None) -> None:
        self.calls: list[str] = []
        self.deleted: list[str] = []
        self.fail_at = fail_at

    def _step(self, name: str) -> None:
        self.calls.append(name)
        if self.fail_at == name:
            raise _api_error(401, TOKEN)

    def create_rich_menu(self, request):
        self._step("create")
        return SimpleNamespace(rich_menu_id="new")

    def set_default_rich_menu(self, rich_menu_id):
        self._step("default")

    def get_rich_menu_list(self):
        self._step("list")
        return SimpleNamespace(
            richmenus=[
                SimpleNamespace(rich_menu_id="new", name="gac-main-v1"),
                SimpleNamespace(rich_menu_id="old", name="gac-main-v0"),
                SimpleNamespace(rich_menu_id="x", name="unrelated"),
            ]
        )

    def delete_rich_menu(self, rich_menu_id):
        self._step("delete")
        self.deleted.append(rich_menu_id)


class FakeBlob:
    def __init__(self) -> None:
        self.uploads: list[tuple] = []

    def set_rich_menu_image(self, rich_menu_id, body, **kwargs):
        self.uploads.append((rich_menu_id, body, kwargs))


def _api_error(status: int, reason: str) -> Exception:
    from linebot.v3.messaging.exceptions import ApiException

    return ApiException(status=status, reason=reason)


@pytest.fixture
def env(tmp_path):
    image = tmp_path / "richmenu.png"
    image.write_bytes(PNG)
    return {
        "LINE_CHANNEL_ACCESS_TOKEN": TOKEN,
        "LIFF_ID": LIFF,
        "RICHMENU_IMAGE": str(image),
    }


def test_main_publishes_and_cleans_up(env, capsys):
    api, blob = FakeApi(), FakeBlob()
    assert main(api, blob, env) == 0
    assert api.calls == ["create", "default", "list", "delete"]
    assert api.deleted == ["old"]
    rich_menu_id, body, kwargs = blob.uploads[0]
    assert (rich_menu_id, body) == ("new", PNG)
    assert kwargs["_headers"] == {"Content-Type": "image/png"}
    assert "create_rich_menu" in capsys.readouterr().out


def test_main_rejects_image_over_1mb(env, tmp_path, capsys):
    big = tmp_path / "big.png"
    big.write_bytes(b"0" * 1_000_001)
    env["RICHMENU_IMAGE"] = str(big)
    api = FakeApi()
    assert main(api, FakeBlob(), env) == 1
    assert api.calls == []
    assert "1,000,000" in capsys.readouterr().out


def test_main_never_prints_token(env, capsys):
    main(FakeApi(), FakeBlob(), env)
    main(FakeApi(fail_at="create"), FakeBlob(), env)
    main(FakeApi(fail_at="delete"), FakeBlob(), env)
    out = capsys.readouterr()
    assert TOKEN not in out.out + out.err
    assert "401" in out.out
