import { mkdtempSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startBuildServer } from "./e2e/swServer";

// The service worker browser checks close this server after each test. In CI one close once waited until the test's
// two-minute limit, and it could not be reproduced here. A close that stalls now says which connections held it,
// then ends them, so the next time leaves evidence instead of a timeout.
describe("startBuildServer", () => {
  it("names the connections a stalled close waits on, then ends them", async () => {
    const root = mkdtempSync(join(tmpdir(), "byt-sw-server-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>t</title>");
    const lines: string[] = [];
    const server = await startBuildServer(root, { stallMs: 200, log: (line) => lines.push(line) });
    const socket = connect(Number(new URL(server.url).port), "127.0.0.1");
    try {
      await new Promise<void>((done, fail) => { socket.once("connect", () => done()); socket.once("error", fail); });
      // A request whose headers never finish keeps its connection busy, as an unfinished browser request would.
      socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n");
      await new Promise((done) => setTimeout(done, 100));
      const closed = await Promise.race([
        server.close().then(() => "closed"),
        new Promise((done) => setTimeout(() => done("still waiting"), 3000)),
      ]);
      expect(closed).toBe("closed");
      expect(lines[0]).toMatch(/^SW-KILL CLOSE STALL: close waited 200 ms; 1 connection\(s\) open$/);
      expect(lines[1]).toMatch(/^ {2}127\.0\.0\.1:\d+ open for \d+ ms$/);
    } finally {
      socket.destroy();
    }
  });

  it("says nothing when the close does not stall", async () => {
    const root = mkdtempSync(join(tmpdir(), "byt-sw-server-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>t</title>");
    const lines: string[] = [];
    const server = await startBuildServer(root, { stallMs: 200, log: (line) => lines.push(line) });
    await server.close();
    expect(lines).toEqual([]);
  });
});
