import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ made: [] as Array<{ name: string; opts: unknown; data?: unknown }> }));
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn((_f: unknown, name: string, opts: unknown) => {
    const entry: { name: string; opts: unknown; data?: unknown } = { name, opts };
    calls.made.push(entry);
    return vi.fn(async (data: unknown) => {
      entry.data = data;
      return { data: name === "startJoin" ? { key: "A".repeat(26), expiresAt: 5 } : { boxId: "b1", joined: true } };
    });
  }),
}));
const { joinClient, joinErrorText } = await import("./client");

describe("joinClient", () => {
  it("calls each callable with a limited-use App Check token, and only after sign-in", async () => {
    let signedIn!: (uid: string) => void;
    const client = joinClient({} as never, new Promise((r) => { signedIn = r; }));
    expect(calls.made.map((c) => [c.name, c.opts])).toEqual([
      ["startJoin", { limitedUseAppCheckTokens: true }], ["joinBox", { limitedUseAppCheckTokens: true }],
    ]);
    const started = client.startJoin("b1");
    await Promise.resolve();
    expect(calls.made[0]?.data).toBeUndefined();
    signedIn("u1");
    await expect(started).resolves.toEqual({ key: "A".repeat(26), expiresAt: 5 });
    expect(calls.made[0]?.data).toEqual({ boxId: "b1" });
    await expect(client.joinBox("b1", "K")).resolves.toEqual({ boxId: "b1", joined: true });
    expect(calls.made[1]?.data).toEqual({ boxId: "b1", key: "K" });
  });
});

describe("joinErrorText", () => {
  it("shows the server's own words for the refusals it makes, and one plain line for anything else", () => {
    expect(joinErrorText({ code: "functions/deadline-exceeded", message: "That code has run out. Show a new code on the laptop." }))
      .toBe("That code has run out. Show a new code on the laptop.");
    expect(joinErrorText({ code: "functions/unauthenticated", message: "Unauthenticated" })).toBe("That did not work. Check the connection and try again.");
    expect(joinErrorText(new Error("offline"))).toBe("That did not work. Check the connection and try again.");
  });
});
