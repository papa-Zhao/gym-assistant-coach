import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import liff from "@line/liff";
import { App } from "./App";
import { configureApi } from "./api";
import { login, type AuthState } from "./auth";
import { themeCss } from "./theme";
import { taipeiDate } from "@gac/shared";

const style = document.createElement("style");
style.textContent = themeCss();
document.head.appendChild(style);

const liffId = import.meta.env.VITE_LIFF_ID;
const apiUrl = import.meta.env.VITE_API_URL;
if (apiUrl) {
  configureApi({ apiUrl, relogin: () => login({ liff, liffId, apiUrl }) });
}

function Root() {
  const [state, setState] = useState<AuthState>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void login({ liff, liffId, apiUrl }).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <App
      state={state}
      pathname={location.pathname}
      today={taipeiDate(new Date())}
      onClose={() => liff.closeWindow()}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
