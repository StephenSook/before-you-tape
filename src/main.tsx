import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerServiceWorker } from "./pwa/register";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Only a production build has a worker to register; a browser without service workers just runs the page.
if (import.meta.env.PROD && "serviceWorker" in navigator) void registerServiceWorker().catch(() => undefined);
