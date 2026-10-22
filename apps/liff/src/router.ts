export type Route =
  "profile" | "settings" | "records" | "body" | "workout" | "meal";

const ROUTES: readonly Route[] = [
  "profile",
  "settings",
  "records",
  "body",
  "workout",
  "meal",
];

/**
 * Maps `location.pathname` to a page. LIFF opens
 * `https://liff.line.me/{id}/profile` at the endpoint URL plus `/profile`, so
 * only the last path segment matters. Anything unknown is the profile page.
 */
export function route(pathname: string): Route {
  const last = pathname.split("/").filter(Boolean).at(-1);
  return ROUTES.find((r) => r === last) ?? "profile";
}
