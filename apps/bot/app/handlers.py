import logging
from urllib.parse import parse_qs

from fastapi import FastAPI, Request, Response
from linebot.v3 import WebhookParser
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import (
    Event,
    FollowEvent,
    MessageEvent,
    PostbackEvent,
    UnfollowEvent,
)
from starlette.concurrency import run_in_threadpool

from app import messages
from app.api_client import ApiClient, ApiError
from app.line_replier import LineReplier
from app.settings import CONSENT_VERSION, Settings

logger = logging.getLogger("gac.bot")


def _is_consent_postback(data: str) -> bool:
    fields = parse_qs(data)
    return fields.get("action") == ["consent"] and fields.get("version") == [CONSENT_VERSION]


def _sync_and_greet(event: FollowEvent | MessageEvent, user_id: str, deps: "_Deps") -> None:
    result = deps.api.sync(user_id, deps.line.profile_name(user_id))
    token = event.reply_token
    if not result.consented:
        deps.line.reply(token, [messages.welcome(deps.settings.public_site_url)])
    elif isinstance(event, FollowEvent):
        deps.line.reply(token, [messages.welcome_back()])
    else:
        deps.line.reply(token, [messages.placeholder_reply()])


class _Deps:
    def __init__(self, settings: Settings, api: ApiClient, line: LineReplier) -> None:
        self.settings = settings
        self.api = api
        self.line = line


def _handle_event(event: Event, deps: _Deps) -> None:
    source = getattr(event, "source", None)
    user_id = getattr(source, "user_id", None)
    if not user_id:
        return
    if isinstance(event, UnfollowEvent):
        deps.api.unfollow(user_id)
        return
    if not isinstance(event, FollowEvent | MessageEvent | PostbackEvent):
        return
    if isinstance(event, PostbackEvent) and not _is_consent_postback(event.postback.data):
        return
    try:
        deps.line.show_loading(user_id)
    except Exception:
        logger.warning("loading animation failed event=%s", event.type)
    if isinstance(event, PostbackEvent):
        deps.api.consent(user_id, CONSENT_VERSION)
        deps.line.reply(event.reply_token, [messages.consent_done(deps.settings.liff_id)])
    else:
        _sync_and_greet(event, user_id, deps)


def _process(events: list[Event], deps: _Deps) -> None:
    for event in events:
        try:
            _handle_event(event, deps)
        except ApiError as err:
            logger.error("api call failed event=%s status=%s", event.type, err.status_code)
        except Exception as err:
            logger.error("event handling failed event=%s error=%s", event.type, type(err).__name__)


def create_app(settings: Settings, api: ApiClient, line: LineReplier) -> FastAPI:
    app = FastAPI(title="Gym Assistant Coach bot")
    deps = _Deps(settings, api, line)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "bot"}

    @app.post("/webhook")
    async def webhook(request: Request) -> Response:
        signature = request.headers.get("X-Line-Signature", "")
        body = (await request.body()).decode("utf-8", errors="replace")
        try:
            events = WebhookParser(deps.settings.line_channel_secret).parse(body, signature)
        except InvalidSignatureError:
            return Response(status_code=400)
        await run_in_threadpool(_process, events, deps)
        return Response(status_code=200)

    return app
