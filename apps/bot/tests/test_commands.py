from app.commands import InvalidMetric, MetricCommand, parse_metric_command


def test_weight_plain() -> None:
    assert parse_metric_command("體重 72.5") == MetricCommand("weightKg", 72.5)


def test_fullwidth_digits_and_space() -> None:
    assert parse_metric_command("體重　７２．５") == MetricCommand("weightKg", 72.5)


def test_colon_and_unit() -> None:
    assert parse_metric_command("體重:72.5kg") == MetricCommand("weightKg", 72.5)


def test_waist_with_unit_word() -> None:
    assert parse_metric_command("腰圍 81 公分") == MetricCommand("waistCm", 81.0)


def test_body_fat_percent() -> None:
    assert parse_metric_command("體脂18.6%") == MetricCommand("bodyFatPct", 18.6)


def test_out_of_range_is_invalid() -> None:
    assert parse_metric_command("體重 7250") == InvalidMetric("weightKg")


def test_rounds_half_up_before_range_check() -> None:
    assert parse_metric_command("體重 72.25") == MetricCommand("weightKg", 72.3)
    assert parse_metric_command("體重 29.96") == MetricCommand("weightKg", 30.0)
    assert parse_metric_command("體重 29.94") == InvalidMetric("weightKg")


def test_missing_number_is_none() -> None:
    assert parse_metric_command("體重") is None


def test_ordinary_text_is_none() -> None:
    assert parse_metric_command("今天吃了雞腿便當") is None
