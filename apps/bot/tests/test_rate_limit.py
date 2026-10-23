from app.rate_limit import USER_EVENT_LIMIT, WINDOW_SECONDS, UserRateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


def test_constants() -> None:
    assert USER_EVENT_LIMIT == 20
    assert WINDOW_SECONDS == 60


def test_ok_then_warn_once_then_drop() -> None:
    limiter = UserRateLimiter(now=FakeClock())
    assert [limiter.check("U1") for _ in range(20)] == ["ok"] * 20
    assert limiter.check("U1") == "warn"
    assert limiter.check("U1") == "drop"
    assert limiter.check("U1") == "drop"


def test_users_are_counted_separately() -> None:
    limiter = UserRateLimiter(now=FakeClock())
    for _ in range(22):
        limiter.check("U1")
    assert limiter.check("U2") == "ok"


def test_window_resets_after_sixty_seconds() -> None:
    clock = FakeClock()
    limiter = UserRateLimiter(now=clock)
    for _ in range(22):
        limiter.check("U1")
    clock.t += 59.9
    assert limiter.check("U1") == "drop"
    clock.t += 0.1
    assert limiter.check("U1") == "ok"


def test_expired_entries_are_pruned() -> None:
    clock = FakeClock()
    limiter = UserRateLimiter(now=clock)
    for i in range(1001):
        limiter.check(f"U{i}")
    clock.t += WINDOW_SECONDS
    limiter.check("fresh")
    assert len(limiter) == 1
