// The deployed callables refuse a request with no App Check token before any handler runs.
import { describe, expect, it, vi } from "vitest";

vi.mock("./handlers", () => ({ startJoinHandler: vi.fn(), joinBoxHandler: vi.fn() }));
const { joinBox, startJoin } = await import("./index");
const handlers = await import("./handlers");

type Callable = (req: unknown, res: unknown) => unknown;
// Calls the function as Cloud Functions does, with a plain callable request and no App Check header.
function call(fn: Callable): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const req = { method: "POST", url: "/", headers, header: (n: string) => headers[n.toLowerCase()], get: (n: string) => headers[n.toLowerCase()], body: { data: { boxId: "box-1", key: "A".repeat(26) } } };
    let status = 200;
    const res = {
      statusCode: 200,
      status(c: number) { status = c; this.statusCode = c; return this; },
      setHeader() {}, getHeader() { return undefined; }, set() { return this; }, vary() { return this; }, on() { return this; },
      send(b: unknown) { resolve({ status, body: typeof b === "string" ? b : JSON.stringify(b) }); },
      json(b: unknown) { resolve({ status, body: JSON.stringify(b) }); },
      end(b?: unknown) { resolve({ status, body: String(b ?? "") }); },
    };
    void fn(req, res);
  });
}

describe("the join callables", () => {
  it("refuse a call with no App Check token, and never reach the handlers", async () => {
    for (const fn of [startJoin, joinBox]) {
      const r = await call(fn as unknown as Callable);
      expect(r.status).toBe(401);
      expect(r.body).toContain("UNAUTHENTICATED");
    }
    expect(handlers.startJoinHandler).not.toHaveBeenCalled();
    expect(handlers.joinBoxHandler).not.toHaveBeenCalled();
  });
});
