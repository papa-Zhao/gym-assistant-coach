import type { AuthState } from "./auth";

interface AppProps {
  state: AuthState;
  onClose: () => void;
}

export function App({ state, onClose }: AppProps) {
  switch (state.kind) {
    case "loading":
      return (
        <main>
          <p>載入中…</p>
        </main>
      );
    case "ready":
      return (
        <main>
          <section className="card">
            <h1>嗨，{state.displayName}</h1>
            <p>帳號已連結完成。個人檔案設定會在下一個版本開放。</p>
          </section>
        </main>
      );
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
