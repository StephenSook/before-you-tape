import { beforeEach, describe, expect, it, vi } from "vitest";

// App Check would start loading reCAPTCHA; the unit tests check our wiring, not Google's.
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn(() => ({})),
  ReCaptchaEnterpriseProvider: vi.fn(),
}));
vi.mock("firebase/auth", async (orig) => ({
  ...(await orig<typeof import("firebase/auth")>()),
  signInAnonymously: vi.fn(async () => ({ user: { uid: "anon-uid" } })),
}));

vi.mock("firebase/firestore", async (orig) => {
  const real = await orig<typeof import("firebase/firestore")>();
  return { ...real, initializeFirestore: vi.fn(real.initializeFirestore), persistentMultipleTabManager: vi.fn(real.persistentMultipleTabManager) };
});

import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { initializeFirestore, persistentMultipleTabManager } from "firebase/firestore";
import { signInAnonymously, type Auth } from "firebase/auth";
import { ensureSignedIn, initFirebase, type FirebaseEnv } from "./app";

const validEnv: FirebaseEnv = {
  VITE_FB_API_KEY: "test-api-key",
  VITE_FB_AUTH_DOMAIN: "demo-byt.firebaseapp.com",
  VITE_FB_PROJECT_ID: "demo-byt",
  VITE_FB_APP_ID: "1:123:web:abc",
  VITE_FB_MEASUREMENT_ID: "",
  VITE_RECAPTCHA_SITE_KEY: "test-site-key",
  VITE_USE_EMULATORS: "false",
};

let n = 0;
const fresh = (patch: Partial<FirebaseEnv> = {}) => initFirebase({ ...validEnv, ...patch }, `test-${n++}`);

describe("initFirebase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a missing config value by name", () => expect(() => fresh({ VITE_FB_PROJECT_ID: "" })).toThrow(/VITE_FB_PROJECT_ID/));

  it("names every missing required value, and treats the measurement id as optional", () => {
    for (const name of ["VITE_FB_API_KEY", "VITE_FB_AUTH_DOMAIN", "VITE_FB_APP_ID", "VITE_RECAPTCHA_SITE_KEY"] as const) {
      expect(() => fresh({ [name]: " " }), name).toThrow(new RegExp(name));
    }
    expect(() => fresh({ VITE_FB_MEASUREMENT_ID: "" })).not.toThrow();
  });

  it("starts App Check with the reCAPTCHA Enterprise key before anything else can call a service", () => {
    fresh();
    expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith("test-site-key");
    expect(initializeAppCheck).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ isTokenAutoRefreshEnabled: true }));
  });

  it("builds the AI instance once and refuses a second token setting", () => {
    const fb = fresh();
    expect(fb.getAi(true)).toBe(fb.getAi(true));
    expect(() => fb.getAi(false)).toThrow(/useLimitedUseAppCheckTokens/);
  });

  it("keeps Firestore in a cache shared by every tab when the browser has IndexedDB, and in memory when not", () => {
    vi.stubGlobal("indexedDB", {});
    fresh();
    const persistent = vi.mocked(initializeFirestore).mock.calls.at(-1)?.[1] as { localCache?: { kind: string } };
    expect(persistent.localCache?.kind).toBe("persistent");
    expect(persistentMultipleTabManager).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.stubGlobal("indexedDB", undefined);
    fresh();
    const memory = vi.mocked(initializeFirestore).mock.calls.at(-1)?.[1] as { localCache?: { kind: string } };
    expect(memory.localCache?.kind).toBe("memory");
    expect(persistentMultipleTabManager).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("refuses an emulator setting that is not true or false", () => expect(() => fresh({ VITE_USE_EMULATORS: "yes" })).toThrow(/VITE_USE_EMULATORS/));
});

describe("ensureSignedIn", () => {
  beforeEach(() => vi.clearAllMocks());

  const fakeAuth = (afterRestore: { uid: string } | null) => {
    const auth = { currentUser: null as { uid: string } | null, authStateReady: async () => { auth.currentUser = afterRestore; } };
    return auth as unknown as Auth;
  };

  it("waits for the saved session, then keeps that user instead of making a new one", async () => {
    await expect(ensureSignedIn(fakeAuth({ uid: "kept-uid" }))).resolves.toBe("kept-uid");
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when no session was saved", async () => {
    await expect(ensureSignedIn(fakeAuth(null))).resolves.toBe("anon-uid");
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });
});
