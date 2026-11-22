// A static server for the service worker tests that can switch which build it serves, as a deploy would: files
// from the current build folder, query strings ignored (the worker adds one when it fetches a file), the app's
// routes answered with index.html as the hosting rewrites them, sw.js never cached, and anything else a 404.
import { readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { extname, join, normalize } from "node:path";
import { appRoutes, type Rewrite } from "../../scripts/pwa-options";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};
const routes = appRoutes((JSON.parse(readFileSync("firebase.json", "utf8")) as { hosting: { rewrites: Rewrite[] } }).hosting.rewrites);

export interface BuildServer { url: string; serve(root: string): void; close(): Promise<void> }

// A close that waits longer than stallMs says which connections held it, then ends them. In CI one close once waited
// until the test's two-minute limit, and the cause could not be reproduced; this records it the next time it happens.
// It is a stopgap, not a fix.
export interface BuildServerOptions { stallMs?: number; log?: (line: string) => void }

export async function startBuildServer(root: string, o: BuildServerOptions = {}): Promise<BuildServer> {
  let current = root;
  const file = (path: string) => {
    const full = normalize(join(current, path));
    if (!full.startsWith(normalize(current))) return null;
    try { return statSync(full).isFile() ? full : null; } catch { return null; }
  };
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const hit = file(path) ?? (routes.some((re) => re.test(path)) ? file("/index.html") : null);
    if (!hit) { res.writeHead(404, { "Content-Type": "text/plain" }).end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(hit)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(readFileSync(hit));
  });
  const opened = new Map<Socket, number>();
  server.on("connection", (socket) => {
    opened.set(socket, Date.now());
    socket.on("close", () => opened.delete(socket));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    serve(next) { current = next; },
    close: () => new Promise<void>((done) => {
      const stallMs = o.stallMs ?? 5000;
      const log = o.log ?? ((line: string) => console.error(line));
      const stall = setTimeout(() => {
        const now = Date.now();
        server.getConnections((error, count) => {
          log(`SW-KILL CLOSE STALL: close waited ${stallMs} ms; ${error ? "an unknown number of" : count} connection(s) open`);
          for (const [socket, at] of opened) log(`  ${socket.remoteAddress}:${socket.remotePort} open for ${now - at} ms`);
          server.closeAllConnections();
        });
      }, stallMs);
      server.close(() => { clearTimeout(stall); done(); });
    }),
  };
}
