"""Per-LINE-user event limit, kept in memory per Cloud Run instance."""

import threading
import time
from collections.abc import Callable
from typing import Literal

USER_EVENT_LIMIT = 20
WINDOW_SECONDS = 60

# Above this many tracked users, expired windows are pruned on the next check.
_PRUNE_AT = 1000

Verdict = Literal["ok", "warn", "drop"]


class UserRateLimiter:
    """Fixed window per user, from the first event: `limit` events pass, the next
    one gets a single warning reply, and the rest of the window is dropped."""

    def __init__(
        self,
        limit: int = USER_EVENT_LIMIT,
        window_seconds: float = WINDOW_SECONDS,
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self._limit = limit
        self._window = window_seconds
        self._now = now
        # user id -> (window start, events seen in the window)
        self._windows: dict[str, tuple[float, int]] = {}
        # _process runs in a threadpool, so webhooks can overlap.
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self._windows)

    def check(self, user_id: str) -> Verdict:
        now = self._now()
        with self._lock:
            if len(self._windows) > _PRUNE_AT:
                self._windows = {
                    k: v for k, v in self._windows.items() if now - v[0] < self._window
                }
            start, count = self._windows.get(user_id, (now, 0))
            if now - start >= self._window:
                start, count = now, 0
            count += 1
            self._windows[user_id] = (start, count)
        if count <= self._limit:
            return "ok"
        return "warn" if count == self._limit + 1 else "drop"
