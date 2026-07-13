import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TimerOverlay } from "./features/timer/TimerOverlay";
import "./styles/global.css";

function isOverlayBoot(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("window") === "timer-overlay") return true;
  } catch {
    /* ignore */
  }
  try {
    return getCurrentWindow().label === "timer-overlay";
  } catch {
    return false;
  }
}

function Root() {
  const [mode, setMode] = useState<"loading" | "main" | "overlay">("loading");

  useEffect(() => {
    setMode(isOverlayBoot() ? "overlay" : "main");
  }, []);

  if (mode === "loading") {
    return (
      <div
        style={{
          padding: 12,
          background: "#1a2330",
          color: "#9aabbc",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        …
      </div>
    );
  }
  if (mode === "overlay") {
    return <TimerOverlay />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
