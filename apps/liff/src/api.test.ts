import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, type LiffLike } from "./auth";
import { ApiHttpError, AuthExpiredError, apiFetch, configureApi } from "./api";

const API = "https://api.test";

const liff: LiffLike = {
  init: async () => {},
  isLoggedIn: () => true,
  login: () => {},
  getIDToken: () => "id-token",
  closeWindow: () => {},
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("apiFetch", () => {
  let sessions: number;
  let fetchImpl: ReturnType<typeof vi.fn>;

  function setup(
    handler: (url: string, auth: string | null) => Response,
  ): void {
    sessions = 0;
    fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${API}/auth/liff`) {
        sessions += 1;
        return json({ accessToken: `s${sessions}`, displayName: "小明" });
      }
      return handler(url, new Headers(init?.headers).get("authorization"));
    });
    configureApi({
      apiUrl: API,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      relogin: () =>
        login({
          liff,
          liffId: "id",
          apiUrl: API,
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
    });
  }

  beforeEach(async () => {
    setup(() => json({}));
    await login({
      liff,
      liffId: "id",
      apiUrl: API,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });

  it("sends the bearer token and parses JSON", async () => {
    setup((_, auth) => json({ auth }));
    await login({
      liff,
      liffId: "id",
      apiUrl: API,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(apiFetch<{ auth: string }>("/profile")).resolves.toEqual({
      auth: "Bearer s1",
    });
  });

  it("401 triggers one re-login and retry", async () => {
    setup((_, auth) =>
      auth === "Bearer s2"
        ? json({ ok: true })
        : json({ error: "unauthorized" }, 401),
    );
    await login({
      liff,
      liffId: "id",
      apiUrl: API,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(apiFetch("/profile")).resolves.toEqual({ ok: true });
    expect(sessions).toBe(2);
    const calls = fetchImpl.mock.calls.filter(
      ([url]) => url === `${API}/profile`,
    );
    expect(calls).toHaveLength(2);
  });

  it("a second 401 gives up with AuthExpiredError", async () => {
    setup(() => json({ error: "unauthorized" }, 401));
    await login({
      liff,
      liffId: "id",
      apiUrl: API,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(apiFetch("/profile")).rejects.toBeInstanceOf(AuthExpiredError);
    expect(sessions).toBe(2);
  });

  it("throws ApiHttpError with the status for other failures", async () => {
    setup(() => json({ error: "conflict" }, 409));
    await expect(apiFetch("/profile/targets")).rejects.toMatchObject({
      status: 409,
    });
    await expect(apiFetch("/profile/targets")).rejects.toBeInstanceOf(
      ApiHttpError,
    );
  });
});
