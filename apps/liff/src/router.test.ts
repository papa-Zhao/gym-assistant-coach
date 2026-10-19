import { describe, expect, it } from "vitest";
import { route } from "./router";

describe("route", () => {
  it.each([
    ["/profile", "profile"],
    ["/settings", "settings"],
    ["/records", "records"],
    ["/records/body", "body"],
    ["/workout", "workout"],
    ["/", "profile"],
    ["", "profile"],
    ["/unknown", "profile"],
    ["/settings/", "settings"],
  ] as const)("maps %s to %s", (pathname, expected) => {
    expect(route(pathname)).toBe(expected);
  });
});
