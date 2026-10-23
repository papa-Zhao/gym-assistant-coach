import { getAccessToken, type AuthState } from "./auth";

export interface ApiConfig {
  apiUrl: string;
  /** Re-posts a fresh LIFF ID token; must update the in-memory session. */
  relogin: () => Promise<AuthState>;
  fetchImpl?: typeof fetch;
}

/** The API answered with a non-2xx status (other than a recoverable 401). */
export class ApiHttpError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`);
    this.name = "ApiHttpError";
  }
}

export const RATE_LIMITED_MESSAGE = "操作太頻繁，請稍等一分鐘再試。";

/** The rate-limit message on a 429, otherwise `fallback`. */
export function failureMessage(err: unknown, fallback: string): string {
  return err instanceof ApiHttpError && err.status === 429
    ? RATE_LIMITED_MESSAGE
    : fallback;
}

/** The session expired and a fresh login did not fix it. */
export class AuthExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "AuthExpiredError";
  }
}

let config: ApiConfig | null = null;

export function configureApi(next: ApiConfig): void {
  config = next;
}

/**
 * Calls the API with the in-memory session token. On a 401 it logs in again
 * once and retries once; a second 401, or a login that is not ready, throws
 * `AuthExpiredError`.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!config) throw new Error("apiFetch used before configureApi");
  const { apiUrl, relogin } = config;
  const send = () => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${getAccessToken() ?? ""}`);
    // Raw bytes keep the caller's content-type; everything else is JSON.
    const raw = init.body instanceof Blob || init.body instanceof ArrayBuffer;
    if (init.body !== undefined && init.body !== null && !raw)
      headers.set("content-type", "application/json");
    return (config?.fetchImpl ?? fetch)(`${apiUrl}${path}`, {
      ...init,
      headers,
    });
  };

  let res = await send();
  if (res.status === 401) {
    const state = await relogin();
    if (state.kind !== "ready") throw new AuthExpiredError();
    res = await send();
    if (res.status === 401) throw new AuthExpiredError();
  }
  if (!res.ok) throw new ApiHttpError(res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
