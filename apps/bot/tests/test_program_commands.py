import pytest

from app.program_commands import ProgramPostback, parse_program_postback, program_save_data

ID = "0b0e7c9e-3f55-4c0a-9a43-2d4a5f6c7d8e"


def test_parse_valid() -> None:
    assert parse_program_postback(f"action=program_save&id={ID}&day=3") == ProgramPostback(ID, 3)


@pytest.mark.parametrize("day", range(1, 8))
def test_round_trip(day: int) -> None:
    data = program_save_data(ID, day)
    assert data == f"action=program_save&id={ID}&day={day}"
    assert len(data) <= 300
    assert parse_program_postback(data) == ProgramPostback(ID, day)


@pytest.mark.parametrize(
    "data",
    [
        f"action=program_save&id={ID}&day=0",
        f"action=program_save&id={ID}&day=8",
        f"action=program_save&id={ID}&day=1.5",
        f"action=program_save&id={ID}&day=01x",
        f"action=program_save&id={ID}&day=-1",
        f"action=program_save&id={ID}&day=",
        f"action=program_save&id={ID.upper()}&day=1",
        "action=program_save&id=abc&day=1",
        f"action=program_save&id={ID}",
        "action=program_save&day=1",
        f"action=program_save&id={ID}&day=1&extra=1",
        f"action=program_save&id={ID}&id={ID}&day=1",
        f"action=program_save&id={ID}&day=1&day=2",
        f"action=other&id={ID}&day=1",
        "",
    ],
)
def test_parse_rejects(data: str) -> None:
    assert parse_program_postback(data) is None
