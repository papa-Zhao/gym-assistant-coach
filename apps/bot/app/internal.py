import logging
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from app import messages
from app.api_client import WorkoutSummary
from app.line_replier import LineReplier
from app.settings import Settings

logger = logging.getLogger("gac.bot")

VerifyApiToken = Callable[[str, str], dict[str, Any]]
"""(token, audience) -> verified claims; raises on any invalid token."""


def google_verifier(token: str, audience: str) -> dict[str, Any]:
    return id_token.verify_oauth2_token(token, google_requests.Request(), audience=audience)


class WorkoutFinished(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    line_user_id: str = Field(alias="lineUserId", pattern=r"^U[0-9a-f]{32}$")
    summary: WorkoutSummary
    template_name: str | None = Field(default=None, alias="templateName")


def _is_api_caller(request: Request, settings: Settings, verify: VerifyApiToken) -> bool:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or " " in token:
        return False
    if not settings.bot_audience or not settings.api_sa_email:
        return False
    try:
        claims = verify(token, settings.bot_audience)
    except Exception:
        return False
    return claims.get("email") == settings.api_sa_email and claims.get("email_verified") is True


def internal_router(settings: Settings, line: LineReplier, verify: VerifyApiToken) -> APIRouter:
    router = APIRouter(prefix="/internal")

    @router.post("/notify/workout-finished")
    async def workout_finished(request: Request) -> Response:
        # Authenticate before the body is read.
        if not await run_in_threadpool(_is_api_caller, request, settings, verify):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        try:
            payload = WorkoutFinished.model_validate_json(await request.body())
        except ValidationError:
            return JSONResponse({"error": "bad_request"}, status_code=400)
        message = messages.workout_done(payload.summary, payload.template_name, settings.liff_id)
        try:
            await run_in_threadpool(line.push, payload.line_user_id, [message])
        except Exception as err:
            logger.error("push failed error=%s", type(err).__name__)
            return JSONResponse({"error": "push_failed"}, status_code=502)
        return Response(status_code=204)

    return router
