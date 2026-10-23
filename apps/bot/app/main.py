from functools import cache
from typing import Any, cast

from app.api_client import ApiClient, HttpApiClient
from app.handlers import create_app
from app.line_replier import LineReplier, SdkLineReplier
from app.logging_setup import configure_logging
from app.settings import Settings


@cache
def _settings() -> Settings:
    return Settings.from_env()


class _Lazy:
    """Defers building a dependency until first use, so /health needs no configuration."""

    def __init__(self, build: Any) -> None:
        self._build = build

    def __getattr__(self, name: str) -> Any:
        return getattr(self._build(), name)


@cache
def _api() -> ApiClient:
    return HttpApiClient(_settings())


@cache
def _line() -> LineReplier:
    return SdkLineReplier(_settings().line_channel_access_token)


configure_logging()

app = create_app(
    cast(Settings, _Lazy(_settings)),
    cast(ApiClient, _Lazy(_api)),
    cast(LineReplier, _Lazy(_line)),
)
