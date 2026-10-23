"""One-line JSON logs on stdout, with the `severity` field Cloud Logging reads."""

import json
import logging
import sys
from typing import TextIO


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # Python's level names already match Cloud Logging (INFO, WARNING, ...).
        return json.dumps(
            {
                "severity": record.levelname,
                "message": record.getMessage(),
                "logger": record.name,
            },
            ensure_ascii=False,
        )


class _JsonHandler(logging.StreamHandler):
    pass


def configure_logging(stream: TextIO = sys.stdout) -> None:
    """Send INFO and above to `stream` as JSON; calling it again replaces our handler."""
    root = logging.getLogger()
    root.handlers[:] = [h for h in root.handlers if not isinstance(h, _JsonHandler)]
    handler = _JsonHandler(stream)
    handler.setFormatter(_JsonFormatter())
    root.addHandler(handler)
    root.setLevel(logging.INFO)
