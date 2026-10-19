import { describe, expect, it, vi } from "vitest";
import { login, type LiffLike } from "./auth";

function fakeLiff(overrides: Partial<LiffLike> = {}): LiffLike {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockReturnValue(true),
    login: vi.fn(),
    getIDToken: vi.fn().mockReturnValue("id-token"),
    closeWindow: vi.fn(),
    ...overrides,
  };
}

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const base = { liffId: "liff-1", apiUrl: "https://api.test" };

describe("login", () => {
  it("logs in when not logged in", async () => {
    const liff = fakeLiff({ isLoggedIn: vi.fn().mockReturnValue(false) });
    const fetchImpl = vi.fn();
    const state = await login({ ...base, liff, fetchImpl });
    expect(liff.init).toHaveBeenCalledWith({ liffId: "liff-1" });
    expect(liff.login).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state).toEqual({ kind: "loading" });
  });

  it("returns ready with display name", async () => {
    const fetchImpl = vi.fn(() =>
      json(200, { accessToken: "a", expiresIn: 3600, displayName: "小明" }),
    );
    const state = await login({ ...base, liff: fakeLiff(), fetchImpl });
    expect(state).toEqual({ kind: "ready", displayName: "小明" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/auth/liff",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idToken: "id-token" }),
      }),
    );
  });

  it("maps 403 to consent_required", async () => {
    const fetchImpl = vi.fn(() => json(403, { error: "consent_required" }));
    const state = await login({ ...base, liff: fakeLiff(), fetchImpl });
    expect(state).toEqual({ kind: "consent_required" });
  });

  it("maps network failure to error", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError("offline")));
    const state = await login({ ...base, liff: fakeLiff(), fetchImpl });
    expect(state).toEqual({ kind: "error" });
  });

  it("maps 401 and null id token to error", async () => {
    const f401 = vi.fn(() => json(401, { error: "unauthorized" }));
    expect(await login({ ...base, liff: fakeLiff(), fetchImpl: f401 })).toEqual(
      {
        kind: "error",
      },
    );
    const liff = fakeLiff({ getIDToken: vi.fn().mockReturnValue(null) });
    expect(await login({ ...base, liff, fetchImpl: vi.fn() })).toEqual({
      kind: "error",
    });
  });

  it("maps missing config to error without calling liff", async () => {
    const liff = fakeLiff();
    expect(await login({ liff, liffId: undefined, apiUrl: "x" })).toEqual({
      kind: "error",
    });
    expect(await login({ liff, liffId: "x", apiUrl: undefined })).toEqual({
      kind: "error",
    });
    expect(liff.init).not.toHaveBeenCalled();
  });
});
