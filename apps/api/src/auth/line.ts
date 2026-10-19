import type { VerifyLineIdToken } from "../deps.js";

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export function createLineVerifier(
  channelId: string,
  fetchImpl: typeof fetch = fetch,
): VerifyLineIdToken {
  return async (idToken) => {
    const res = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    // Never include the response body: it may echo token details.
    if (res.status !== 200) {
      throw new Error(`LINE verify failed with status ${res.status}`);
    }
    const data = (await res.json()) as { sub?: unknown; name?: unknown };
    if (typeof data.sub !== "string" || data.sub === "") {
      throw new Error("LINE verify response has no sub");
    }
    return {
      sub: data.sub,
      name:
        typeof data.name === "string" && data.name !== "" ? data.name : null,
    };
  };
}
