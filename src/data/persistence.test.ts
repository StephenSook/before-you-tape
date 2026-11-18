import { describe, expect, it, vi } from "vitest";
import type { BoxPersistence, BoxState } from "./boxStore";
import { persistenceAfterSignIn } from "./persistence";

const fake = () => ({
  save: vi.fn<BoxPersistence["save"]>(),
  load: vi.fn<BoxPersistence["load"]>(async () => ({ destinationCode: "PH" })),
});
const state = { boxId: "b1" } as BoxState;

describe("persistenceAfterSignIn", () => {
  it("waits for sign-in, then uses Firestore for loads and saves made before and after", async () => {
    let signedIn!: (uid: string) => void;
    const signIn = new Promise<string>((r) => { signedIn = r; });
    const cloud = fake();
    const make = vi.fn(() => cloud);
    const p = persistenceAfterSignIn(signIn, make, fake());
    p.save(state);
    const loading = p.load("b1");
    expect(make).not.toHaveBeenCalled();
    signedIn("alice");
    expect(await loading).toEqual({ destinationCode: "PH" });
    p.save(state);
    await p.idle();
    expect(make).toHaveBeenCalledWith("alice");
    expect(cloud.save).toHaveBeenCalledTimes(2);
  });

  it("keeps the box in this browser when sign-in fails", async () => {
    const local = fake();
    const make = vi.fn();
    const p = persistenceAfterSignIn(Promise.reject(new Error("offline")), make, local);
    p.save(state);
    expect(await p.load("b1")).toEqual({ destinationCode: "PH" });
    await p.idle();
    expect(make).not.toHaveBeenCalled();
    expect(local.save).toHaveBeenCalledWith(state);
  });
});
