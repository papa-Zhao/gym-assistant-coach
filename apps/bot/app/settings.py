import os
from dataclasses import dataclass

CONSENT_VERSION = "2026-10-19"


@dataclass(frozen=True)
class Settings:
    line_channel_secret: str
    line_channel_access_token: str
    api_url: str
    internal_audience: str
    liff_id: str
    public_site_url: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            line_channel_secret=os.environ["LINE_CHANNEL_SECRET"],
            line_channel_access_token=os.environ["LINE_CHANNEL_ACCESS_TOKEN"],
            api_url=os.environ["API_URL"].rstrip("/"),
            internal_audience=os.environ["INTERNAL_AUDIENCE"],
            liff_id=os.environ["LIFF_ID"],
            public_site_url=os.environ["PUBLIC_SITE_URL"].rstrip("/"),
        )
