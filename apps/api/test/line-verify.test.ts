import { describe, expect, it } from "vitest";
import { createLineVerifier } from "../src/auth/line";

describe("createLineVerifier", () => {
  it("posts id_token and client_id as form", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ sub: "Uabc", name: "Amy" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const verify = createLineVerifier("1234", fakeFetch);
    expect(await verify("tok")).toEqual({ sub: "Uabc", name: "Amy" });
    expect(captured?.url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(captured?.init.method).toBe("POST");
    const body = new URLSearchParams(String(captured?.init.body));
    expect(body.get("id_token")).toBe("tok");
    expect(body.get("client_id")).toBe("1234");
  });

  it("returns name null when LINE omits it", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ sub: "Uabc" }), {
        status: 200,
      })) as unknown as typeof fetch;
    expect(await createLineVerifier("1", fakeFetch)("t")).toEqual({
      sub: "Uabc",
      name: null,
    });
  });

  it("rejects on 400", async () => {
    const fakeFetch = (async () =>
      new Response("{}", { status: 400 })) as unknown as typeof fetch;
    await expect(createLineVerifier("1", fakeFetch)("t")).rejects.toThrow();
  });
});
