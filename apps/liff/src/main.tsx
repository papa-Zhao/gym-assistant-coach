import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import liff from "@line/liff";
import { App } from "./App";
import { login, type AuthState } from "./auth";
import { themeCss } from "./theme";

const style = document.createElement("style");
style.textContent = themeCss();
document.head.appendChild(style);

function Root() {
  const [state, setState] = useState<AuthState>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void login({
      liff,
      liffId: import.meta.env.VITE_LIFF_ID,
      apiUrl: import.meta.env.VITE_API_URL,
    }).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return <App state={state} onClose={() => liff.closeWindow()} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
