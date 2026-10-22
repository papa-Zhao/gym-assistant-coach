from unittest.mock import patch

from app.line_replier import MESSAGE_CONTENT_TIMEOUT_SECONDS, SdkLineReplier


def test_get_message_content_passes_a_request_timeout() -> None:
    replier = SdkLineReplier("t")
    with patch("app.line_replier.MessagingApiBlob") as blob:
        blob.return_value.get_message_content.return_value = bytearray(b"img")
        assert replier.get_message_content("m1") == b"img"
    blob.return_value.get_message_content.assert_called_once_with(
        "m1", _request_timeout=MESSAGE_CONTENT_TIMEOUT_SECONDS
    )
