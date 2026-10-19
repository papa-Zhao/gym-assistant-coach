import { useState } from "react";
import type { AuthState } from "./auth";
import { route } from "./router";
import { BodyMetrics } from "./pages/BodyMetrics";
import { Placeholder } from "./pages/Placeholder";
import { Profile } from "./pages/Profile";
import { Records } from "./pages/Records";
import { Settings } from "./pages/Settings";

interface AppProps {
  state: AuthState;
  pathname: string;
  /** Taipei calendar date (`YYYY-MM-DD`) used for age and target maths. */
  today: string;
  onClose: () => void;
}

export function App({ state, pathname, today, onClose }: AppProps) {
  const [failed, setFailed] = useState(false);
  const shown: AuthState = failed ? { kind: "error" } : state;

  switch (shown.kind) {
    case "loading":
      return (
        <main>
          <p>載入中…</p>
        </main>
      );
    case "ready":
      switch (route(pathname)) {
        case "profile":
          return (
            <Profile
              today={today}
              onClose={onClose}
              onFatal={() => setFailed(true)}
            />
          );
        case "settings":
          return <Settings />;
        case "records":
          return <Records onFatal={() => setFailed(true)} />;
        case "body":
          return <BodyMetrics onFatal={() => setFailed(true)} />;
        case "workout":
          return <Placeholder title="記訓練" onClose={onClose} />;
      }
      break;
    case "consent_required":
      return (
        <main>
          <section className="card">
            <h1>還差一步</h1>
            <p>
              請回到 LINE 聊天室，按下「我已滿 18
              歲，同意並開始」後再打開這個頁面。
            </p>
            <button type="button" onClick={onClose}>
              回到聊天室
            </button>
          </section>
        </main>
      );
    case "error":
      return (
        <main>
          <section className="card">
            <p>連線出了點問題，請稍後再試。</p>
            <button type="button" onClick={() => window.location.reload()}>
              重新整理
            </button>
          </section>
        </main>
      );
  }
}
