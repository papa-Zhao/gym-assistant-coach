import type { ApiError, LiffAuthResponse } from "@gac/shared";

export type AuthState =
  | { kind: "loading" }
  | { kind: "ready"; displayName: string }
  | { kind: "consent_required" }
  | { kind: "error" };

/** The subset of the `@line/liff` default export that this app uses. */
export interface LiffLike {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(): void;
  getIDToken(): string | null;
  closeWindow(): void;
}

export interface LoginDeps {
  liff: LiffLike;
  liffId: string | undefined;
  apiUrl: string | undefined;
  fetchImpl?: typeof fetch;
}

// The session token lives in memory only (spec §4); never written to storage.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export async function login(deps: LoginDeps): Promise<AuthState> {
  const { liff, liffId, apiUrl } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (!liffId || !apiUrl) return { kind: "error" };
  try {
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return { kind: "loading" };
    }
    const idToken = liff.getIDToken();
    if (!idToken) return { kind: "error" };

    const res = await fetchImpl(`${apiUrl}/auth/liff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as ApiError | null;
      return body?.error === "consent_required"
        ? { kind: "consent_required" }
        : { kind: "error" };
    }
    if (!res.ok) return { kind: "error" };
    const data = (await res.json()) as LiffAuthResponse;
    accessToken = data.accessToken;
    return { kind: "ready", displayName: data.displayName };
  } catch {
    return { kind: "error" };
  }
}
