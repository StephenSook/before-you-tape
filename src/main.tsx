import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerServiceWorker, removeServiceWorkers } from "./pwa/register";
import { startCrashReports } from "./telemetry/crashReports";
import "./styles/app.css";

// Uncaught errors go to Crashlytics without their message (src/telemetry/errorReport.ts), from a production build only.
if (import.meta.env.PROD) startCrashReports();

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Only a production build has a worker to register; a browser without service workers just runs the page. A kill
// build (BYT_SW_KILL) registers none and removes any it finds, on every load.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void (__BYT_SW_KILL__ ? removeServiceWorkers() : registerServiceWorker()).catch(() => undefined);
}
