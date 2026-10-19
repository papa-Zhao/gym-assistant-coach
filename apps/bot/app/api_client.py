from dataclasses import dataclass
from typing import Protocol

import httpx
from google.auth.transport.requests import Request
from google.oauth2 import id_token

from app.settings import Settings


@dataclass(frozen=True)
class SyncResult:
    user_id: str
    consented: bool


class ApiError(Exception):
    """The api answered with a non-2xx status. Carries the status only, never the body."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"api responded {status_code}")
        self.status_code = status_code


class ApiClient(Protocol):
    def sync(self, line_user_id: str, display_name: str | None) -> SyncResult: ...

    def consent(self, line_user_id: str, version: str) -> None: ...

    def unfollow(self, line_user_id: str) -> None: ...


class HttpApiClient:
    def __init__(self, settings: Settings) -> None:
        self._base = settings.api_url
        self._audience = settings.internal_audience

    def _post(self, path: str, body: dict[str, str]) -> httpx.Response:
        token = id_token.fetch_id_token(Request(), self._audience)
        res = httpx.post(
            f"{self._base}{path}",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
            timeout=5.0,
        )
        if res.status_code >= 300:
            raise ApiError(res.status_code)
        return res

    def sync(self, line_user_id: str, display_name: str | None) -> SyncResult:
        body = {"lineUserId": line_user_id}
        if display_name is not None:
            body["displayName"] = display_name
        data = self._post("/internal/users/sync", body).json()
        return SyncResult(user_id=data["userId"], consented=bool(data["consented"]))

    def consent(self, line_user_id: str, version: str) -> None:
        self._post("/internal/users/consent", {"lineUserId": line_user_id, "version": version})

    def unfollow(self, line_user_id: str) -> None:
        self._post("/internal/users/unfollow", {"lineUserId": line_user_id})
