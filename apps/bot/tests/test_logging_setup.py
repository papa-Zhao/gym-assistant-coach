import io
import json
import logging

import pytest

from app.logging_setup import configure_logging


@pytest.fixture(autouse=True)
def restore_root_logger():
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    yield
    root.handlers[:] = handlers
    root.setLevel(level)


def test_error_is_one_json_line_with_severity() -> None:
    stream = io.StringIO()
    configure_logging(stream)
    logging.getLogger("gac.bot").error("api error event=%s", "message")
    lines = stream.getvalue().splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0]) == {
        "severity": "ERROR",
        "message": "api error event=message",
        "logger": "gac.bot",
    }


@pytest.mark.parametrize(
    ("level", "severity"),
    [
        (logging.INFO, "INFO"),
        (logging.WARNING, "WARNING"),
        (logging.CRITICAL, "CRITICAL"),
    ],
)
def test_levels_map_to_severity(level: int, severity: str) -> None:
    stream = io.StringIO()
    configure_logging(stream)
    logging.getLogger("gac.bot").log(level, "x")
    assert json.loads(stream.getvalue())["severity"] == severity


def test_debug_is_dropped() -> None:
    stream = io.StringIO()
    configure_logging(stream)
    logging.getLogger("gac.bot").debug("x")
    assert stream.getvalue() == ""


def test_configuring_twice_adds_one_handler() -> None:
    stream = io.StringIO()
    configure_logging(stream)
    configure_logging(stream)
    logging.getLogger("gac.bot").warning("once")
    assert len(stream.getvalue().splitlines()) == 1
