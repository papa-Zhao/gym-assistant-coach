import { useEffect } from "react";

interface Sentinel {
  release: () => Promise<void>;
}

interface WakeLockApi {
  request: (type: "screen") => Promise<Sentinel>;
}

function getApi(): WakeLockApi | null {
  try {
    if (!("wakeLock" in navigator)) return null;
    return (
      (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock ?? null
    );
  } catch {
    return null;
  }
}

function releaseQuietly(sentinel: Sentinel | null): void {
  try {
    void sentinel?.release().catch(() => {});
  } catch {
    // Ignore release failures.
  }
}

/**
 * Keeps the screen on while `active`. The browser drops the lock whenever the
 * page is hidden, so it is requested again when the page becomes visible.
 * Unsupported browsers and refused requests (e.g. battery saver) are ignored.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let sentinel: Sentinel | null = null;

    const acquire = () => {
      const api = getApi();
      if (!api) return;
      try {
        api
          .request("screen")
          .then((s) => {
            // Unmounted (or deactivated) while pending: let go right away.
            if (cancelled) releaseQuietly(s);
            else {
              releaseQuietly(sentinel);
              sentinel = s;
            }
          })
          .catch(() => {});
      } catch {
        // Ignore request failures.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      releaseQuietly(sentinel);
      sentinel = null;
    };
  }, [active]);
}
