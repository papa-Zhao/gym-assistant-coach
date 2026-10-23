import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureApi } from "./api";
import { deleteAccount, fetchExport, saveFile } from "./dataRights";

const API = "https://api.test";

describe("dataRights", () => {
  let calls: { method: string; url: string }[];
  let respond: () => Response;

  beforeEach(() => {
    calls = [];
    respond = () => new Response(JSON.stringify({ a: 1 }));
    configureApi({
      apiUrl: API,
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push({ method: init?.method ?? "GET", url });
        return respond();
      }) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
  });

  it("fetchExport reads /me/export and names the file by date", async () => {
    const out = await fetchExport("2026-10-23");
    expect(calls).toEqual([{ method: "GET", url: `${API}/me/export` }]);
    expect(out.fileName).toBe("gym-coach-export-2026-10-23.json");
    expect(out.json).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it("deleteAccount sends DELETE /me", async () => {
    respond = () => new Response(null, { status: 204 });
    await deleteAccount();
    expect(calls).toEqual([{ method: "DELETE", url: `${API}/me` }]);
  });

  describe("saveFile", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("downloads the text through a temporary link", () => {
      const created: Blob[] = [];
      const revoked: string[] = [];
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: (blob: Blob) => {
          created.push(blob);
          return "blob:x";
        },
        revokeObjectURL: (url: string) => void revoked.push(url),
      });
      const clicked: HTMLAnchorElement[] = [];
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
          clicked.push(this);
        });
      saveFile("a.json", "{}");
      expect(created[0]?.type).toBe("application/json");
      expect(clicked).toHaveLength(1);
      expect(clicked[0]?.download).toBe("a.json");
      expect(clicked[0]?.href).toBe("blob:x");
      expect(clicked[0]?.isConnected).toBe(false);
      expect(revoked).toEqual(["blob:x"]);
      click.mockRestore();
    });
  });
});
