import logging
from urllib.parse import parse_qs

import httpx
from fastapi import FastAPI, Request, Response
from linebot.v3 import WebhookParser
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import (
    Event,
    FollowEvent,
    ImageMessageContent,
    MessageEvent,
    PostbackEvent,
    UnfollowEvent,
)
from starlette.concurrency import run_in_threadpool

from app import messages
from app.api_client import ApiClient, ApiError
from app.commands import InvalidMetric, MetricCommand, parse_metric_command
from app.internal import VerifyApiToken, google_verifier, internal_router
from app.line_replier import LineReplier
from app.meal_commands import MealPostback, MealText, parse_meal_postback, parse_meal_text
from app.settings import CONSENT_VERSION, Settings

logger = logging.getLogger("gac.bot")

# The AI meal path can take ~20 s; LINE accepts 5-60 in steps of 5.
MEAL_LOADING_SECONDS = 30

RESTART_TEXT = "重新開始"


def _api_failure_reply(
    err: Exception, event_type: str, *, on_not_found: messages.Message
) -> messages.Message | None:
    """Reply for an api failure the user can do nothing about; None means the caller re-raises."""
    if isinstance(err, ApiError):
        if err.status_code == 404:
            return on_not_found
        if err.status_code >= 500:
            logger.warning("api error event=%s status=%s", event_type, err.status_code)
            return messages.meal_outcome("unavailable")
    elif isinstance(err, httpx.TimeoutException | httpx.TransportError):
        logger.warning("api unreachable event=%s", event_type)
        return messages.meal_outcome("unavailable")
    return None


def _is_consent_postback(data: str) -> bool:
    fields = parse_qs(data)
    return fields.get("action") == ["consent"] and fields.get("version") == [CONSENT_VERSION]


_MENU_ACTIONS = ("today", "photo", "ask")


def _menu_action(data: str) -> str | None:
    fields = parse_qs(data)
    if list(fields) != ["action"] or len(fields["action"]) != 1:
        return None
    return fields["action"][0] if fields["action"][0] in _MENU_ACTIONS else None


def _handle_menu(event: PostbackEvent, action: str, user_id: str, deps: "_Deps") -> None:
    token = event.reply_token
    if not deps.api.sync(user_id, deps.line.profile_name(user_id)).consented:
        deps.line.reply(token, [messages.welcome(deps.settings.public_site_url)])
    elif action == "photo":
        deps.line.reply(token, [messages.photo_prompt()])
    elif action == "ask":
        deps.line.reply(token, [messages.ask_menu()])
    else:
        today = deps.api.today(user_id)
        if today.has_profile and today.targets is not None:
            deps.line.reply(token, [messages.today_summary(today, deps.settings.liff_id)])
        else:
            deps.line.reply(token, [messages.profile_needed(deps.settings.liff_id)])


def _handle_meal_postback(
    event: PostbackEvent, postback: MealPostback, user_id: str, deps: "_Deps"
) -> None:
    token = event.reply_token
    if not deps.api.sync(user_id, deps.line.profile_name(user_id)).consented:
        deps.line.reply(token, [messages.welcome(deps.settings.public_site_url)])
        return
    liff_id = deps.settings.liff_id
    try:
        if postback.action == "meal_confirm":
            confirmed = deps.api.confirm_meal(user_id, postback.meal_id)
            reply = messages.meal_confirmed(confirmed, liff_id)
        elif postback.action == "meal_type_menu":
            reply = messages.meal_type_menu(postback.meal_id)
        else:
            if postback.meal_type is None:
                return
            meal = deps.api.set_meal_type(user_id, postback.meal_id, postback.meal_type)
            reply = messages.meal_type_changed(meal, liff_id)
    except Exception as err:
        failure = _api_failure_reply(err, event.type, on_not_found=messages.meal_not_found())
        if failure is None:
            raise
        reply = failure
    deps.line.reply(token, [reply])


def _sync_and_greet(event: FollowEvent | MessageEvent, user_id: str, deps: "_Deps") -> None:
    result = deps.api.sync(user_id, deps.line.profile_name(user_id))
    token = event.reply_token
    if not result.consented:
        deps.line.reply(token, [messages.welcome(deps.settings.public_site_url)])
    elif isinstance(event, FollowEvent):
        deps.line.reply(token, [messages.welcome_back()])
    elif isinstance(event.message, ImageMessageContent):
        _reply_to_image(event, event.message, user_id, deps)
    else:
        _reply_to_text(event, user_id, deps)


def _reply_to_image(
    event: MessageEvent, content: ImageMessageContent, user_id: str, deps: "_Deps"
) -> None:
    token = event.reply_token
    provider = content.content_provider
    if provider is None or provider.type != "line":
        logger.info("meal photo not downloadable event=%s", event.type)
        deps.line.reply(token, [messages.meal_photo_outcome("invalid_image")])
        return
    try:
        image = deps.line.get_message_content(content.id)
    except Exception as err:
        logger.warning(
            "meal photo download failed event=%s error=%s", event.type, type(err).__name__
        )
        deps.line.reply(token, [messages.meal_outcome("unavailable")])
        return
    if len(image) > messages.MEAL_PHOTO_MAX_BYTES:
        logger.info("meal photo too large event=%s bytes=%s", event.type, len(image))
        deps.line.reply(token, [messages.meal_photo_outcome("invalid_image")])
        return
    try:
        result = deps.api.log_meal_photo(user_id, image)
    except Exception as err:
        if isinstance(err, ApiError) and err.status_code == 413:
            reply = messages.meal_photo_outcome("invalid_image")
        else:
            failure = _api_failure_reply(
                err, event.type, on_not_found=messages.meal_photo_outcome("unavailable")
            )
            if failure is None:
                raise
            reply = failure
        deps.line.reply(token, [reply])
        return
    logger.info("meal photo outcome=%s bytes=%s", result.outcome, len(image))
    if result.outcome == "draft" and result.meal is not None:
        deps.line.reply(token, [messages.meal_draft(result.meal, deps.settings.liff_id)])
    else:
        deps.line.reply(token, [messages.meal_photo_outcome(result.outcome)])


def _is_ask_question(text: str) -> bool:
    """True when the text goes to the AI: not a command, meal or restart, and fits the limit."""
    stripped = text.strip()
    if parse_metric_command(text) is not None:
        return False
    if parse_meal_text(text) is not None and stripped not in messages.ASK_QUICK_QUESTIONS:
        return False
    return bool(stripped) and stripped != RESTART_TEXT and len(stripped) <= messages.ASK_MAX_CHARS


def _reply_to_text(event: MessageEvent, user_id: str, deps: "_Deps") -> None:
    token = event.reply_token
    text = getattr(event.message, "text", None)
    command = parse_metric_command(text) if isinstance(text, str) else None
    liff_id = deps.settings.liff_id
    if isinstance(command, MetricCommand):
        recorded = deps.api.record_metric(user_id, command.key, command.value)
        deps.line.reply(token, [messages.metric_recorded(recorded, liff_id)])
        return
    if isinstance(command, InvalidMetric):
        deps.line.reply(token, [messages.metric_range_error(command.key, liff_id)])
        return
    # The quick question "晚餐吃什麼" starts with a meal prefix but is a question, not a log.
    is_quick_question = isinstance(text, str) and text.strip() in messages.ASK_QUICK_QUESTIONS
    meal = parse_meal_text(text) if isinstance(text, str) and not is_quick_question else None
    if meal is not None:
        _reply_to_meal_text(event, meal, user_id, deps)
        return
    if not isinstance(text, str):
        deps.line.reply(token, [messages.ask_menu()])
        return
    if text.strip() == RESTART_TEXT:
        _reply_to_restart(event, user_id, deps)
        return
    question = text.strip()
    # Blank text is not a question (unlike _is_ask_question, which only picks the loading time).
    if not question:
        deps.line.reply(token, [messages.ask_menu()])
    elif len(question) > messages.ASK_MAX_CHARS:
        deps.line.reply(token, [messages.ask_too_long()])
    else:
        _reply_to_question(event, question, user_id, deps)


def _reply_to_meal_text(event: MessageEvent, meal: MealText, user_id: str, deps: "_Deps") -> None:
    token = event.reply_token
    try:
        result = deps.api.log_meal_text(user_id, meal.meal_type, meal.text)
    except Exception as err:
        failure = _api_failure_reply(err, event.type, on_not_found=messages.meal_not_found())
        if failure is None:
            raise
        deps.line.reply(token, [failure])
        return
    if result.outcome == "draft" and result.meal is not None:
        deps.line.reply(token, [messages.meal_draft(result.meal, deps.settings.liff_id)])
    else:
        logger.info("meal text outcome=%s", result.outcome)
        deps.line.reply(token, [messages.meal_outcome(result.outcome)])


def _reply_to_restart(event: MessageEvent, user_id: str, deps: "_Deps") -> None:
    try:
        deps.api.reset_conversation(user_id)
        reply = messages.conversation_reset()
    except Exception as err:
        failure = _api_failure_reply(
            err, event.type, on_not_found=messages.meal_outcome("unavailable")
        )
        if failure is None:
            raise
        reply = failure
    deps.line.reply(event.reply_token, [reply])


def _reply_to_question(event: MessageEvent, question: str, user_id: str, deps: "_Deps") -> None:
    try:
        result = deps.api.ask(user_id, question)
    except Exception as err:
        failure = _api_failure_reply(
            err, event.type, on_not_found=messages.meal_outcome("unavailable")
        )
        if failure is None:
            raise
        deps.line.reply(event.reply_token, [failure])
        return
    logger.info("ask outcome=%s", result.outcome)
    if result.outcome == "answer" and result.advice is not None:
        deps.line.reply(event.reply_token, [messages.advice_card(result.advice)])
    else:
        deps.line.reply(event.reply_token, [messages.ask_outcome(result.outcome)])


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
    action = None
    meal_postback = None
    if isinstance(event, PostbackEvent):
        action = _menu_action(event.postback.data)
        meal_postback = parse_meal_postback(event.postback.data)
        if (
            action is None
            and meal_postback is None
            and not _is_consent_postback(event.postback.data)
        ):
            return
    text = getattr(getattr(event, "message", None), "text", None)
    is_slow_text = isinstance(text, str) and (
        parse_meal_text(text) is not None or _is_ask_question(text)
    )
    is_image = isinstance(getattr(event, "message", None), ImageMessageContent)
    try:
        deps.line.show_loading(user_id, MEAL_LOADING_SECONDS if is_slow_text or is_image else 10)
    except Exception:
        logger.warning("loading animation failed event=%s", event.type)
    if isinstance(event, PostbackEvent) and action is not None:
        _handle_menu(event, action, user_id, deps)
    elif isinstance(event, PostbackEvent) and meal_postback is not None:
        _handle_meal_postback(event, meal_postback, user_id, deps)
    elif isinstance(event, PostbackEvent):
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


def create_app(
    settings: Settings,
    api: ApiClient,
    line: LineReplier,
    verify_api_token: VerifyApiToken | None = None,
) -> FastAPI:
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

    app.include_router(internal_router(settings, line, verify_api_token or google_verifier))

    return app
