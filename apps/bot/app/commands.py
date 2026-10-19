import re
import unicodedata
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

_COMMAND = re.compile(r"^(體重|體脂|腰圍)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|公斤|%|cm|公分)?$")

_KEYS = {"體重": "weightKg", "體脂": "bodyFatPct", "腰圍": "waistCm"}

# Copied from the shared METRIC_LIMITS; keep in sync.
METRIC_LIMITS: dict[str, tuple[int, int]] = {
    "weightKg": (30, 300),
    "bodyFatPct": (3, 60),
    "waistCm": (40, 200),
}


@dataclass(frozen=True)
class MetricCommand:
    key: str
    value: float


@dataclass(frozen=True)
class InvalidMetric:
    key: str


def parse_metric_command(text: str) -> MetricCommand | InvalidMetric | None:
    match = _COMMAND.match(unicodedata.normalize("NFKC", text).strip())
    if match is None:
        return None
    key = _KEYS[match.group(1)]
    value = Decimal(match.group(2)).quantize(Decimal("0.1"), ROUND_HALF_UP)
    low, high = METRIC_LIMITS[key]
    if not low <= value <= high:
        return InvalidMetric(key)
    return MetricCommand(key, float(value))
