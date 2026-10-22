from typing import Protocol

from linebot.v3.messaging import (
    ApiClient as LineApiClient,
)
from linebot.v3.messaging import (
    Configuration,
    FlexMessage,
    MessagingApi,
    MessagingApiBlob,
    PushMessageRequest,
    ReplyMessageRequest,
    ShowLoadingAnimationRequest,
    TextMessage,
)

from app.messages import Message


class LineReplier(Protocol):
    def reply(self, reply_token: str, messages: list[Message]) -> None: ...

    def push(self, user_id: str, messages: list[Message]) -> None: ...

    def profile_name(self, user_id: str) -> str | None: ...

    def show_loading(self, user_id: str, seconds: int = 10) -> None: ...

    def get_message_content(self, message_id: str) -> bytes: ...


def _to_sdk(message: Message) -> FlexMessage | TextMessage:
    if message["type"] == "flex":
        return FlexMessage.from_dict(message)
    return TextMessage.from_dict(message)


class SdkLineReplier:
    def __init__(self, channel_access_token: str) -> None:
        self._configuration = Configuration(access_token=channel_access_token)

    def reply(self, reply_token: str, messages: list[Message]) -> None:
        with LineApiClient(self._configuration) as client:
            MessagingApi(client).reply_message(
                ReplyMessageRequest(
                    reply_token=reply_token,
                    messages=[_to_sdk(m) for m in messages],
                )
            )

    def push(self, user_id: str, messages: list[Message]) -> None:
        with LineApiClient(self._configuration) as client:
            MessagingApi(client).push_message(
                PushMessageRequest(to=user_id, messages=[_to_sdk(m) for m in messages])
            )

    def profile_name(self, user_id: str) -> str | None:
        try:
            with LineApiClient(self._configuration) as client:
                name = MessagingApi(client).get_profile(user_id).display_name
        except Exception:
            return None
        return name or None

    def show_loading(self, user_id: str, seconds: int = 10) -> None:
        with LineApiClient(self._configuration) as client:
            MessagingApi(client).show_loading_animation(
                ShowLoadingAnimationRequest(chat_id=user_id, loading_seconds=seconds)
            )

    def get_message_content(self, message_id: str) -> bytes:
        with LineApiClient(self._configuration) as client:
            return bytes(MessagingApiBlob(client).get_message_content(message_id))
