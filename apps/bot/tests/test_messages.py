from app import messages


def test_consent_done_links_profile_path() -> None:
    uri = messages.consent_done("1234-abcd")["contents"]["footer"]["contents"][0]["action"]["uri"]
    assert uri == "https://liff.line.me/1234-abcd/profile"
