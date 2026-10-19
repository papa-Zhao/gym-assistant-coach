import { GoogleAuth } from "google-auth-library";
import type { NotifyWorkoutFinished } from "../deps.js";

const TIMEOUT_MS = 5000;

export interface BotNotifierOptions {
  fetchImpl?: typeof fetch;
  /** Returns a Google ID token for the audience; injectable for tests. */
  getIdToken?: (audience: string) => Promise<string>;
}

const defaultGetIdToken = async (audience: string): Promise<string> => {
  const client = await new GoogleAuth().getIdTokenClient(audience);
  return client.idTokenProvider.fetchIdToken(audience);
};

/**
 * Pushes the finish summary to the bot. Rejects on any non-2xx response; the
 * error carries no response body and no token.
 */
export function createBotNotifier(
  botUrl: string,
  audience: string,
  opts: BotNotifierOptions = {},
): NotifyWorkoutFinished {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const getIdToken = opts.getIdToken ?? defaultGetIdToken;
  return async (lineUserId, summary, templateName) => {
    const token = await getIdToken(audience);
    const res = await fetchImpl(`${botUrl}/internal/notify/workout-finished`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ lineUserId, summary, templateName }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`bot notify failed with status ${res.status}`);
  };
}
