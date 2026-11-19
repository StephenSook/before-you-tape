// Firebase for the web app: one app, App Check started before any service can be called, anonymous
// sign-in, Firestore, the join callables, and Firebase AI Logic on the Gemini Developer API.
import { getAI, GoogleAIBackend, type AI } from "firebase/ai";
import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager, type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";

export interface FirebaseEnv {
  VITE_FB_API_KEY: string;
  VITE_FB_AUTH_DOMAIN: string;
  VITE_FB_PROJECT_ID: string;
  VITE_FB_APP_ID: string;
  // Optional: a build without this setting must still start.
  VITE_FB_MEASUREMENT_ID?: string;
  VITE_RECAPTCHA_SITE_KEY: string;
  VITE_USE_EMULATORS: string;
}

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  // The QR handoff's callables, startJoin and joinBox, in the region they are deployed to.
  functions: Functions;
  getAi(useLimitedUseTokens: boolean): AI;
}

export class FirebaseConfigError extends Error {
  override name = "FirebaseConfigError";
}

const REQUIRED = ["VITE_FB_API_KEY", "VITE_FB_AUTH_DOMAIN", "VITE_FB_PROJECT_ID", "VITE_FB_APP_ID", "VITE_RECAPTCHA_SITE_KEY"] as const;

// `name` lets tests start several apps side by side; the web app uses the default app.
export function initFirebase(env: FirebaseEnv, name?: string): FirebaseHandles {
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  if (missing.length > 0) throw new FirebaseConfigError(`Missing Firebase config value: ${missing.join(", ")}`);
  if (env.VITE_USE_EMULATORS !== "true" && env.VITE_USE_EMULATORS !== "false") {
    throw new FirebaseConfigError(`VITE_USE_EMULATORS must be "true" or "false", not "${env.VITE_USE_EMULATORS}"`);
  }

  const options: FirebaseOptions = {
    apiKey: env.VITE_FB_API_KEY,
    authDomain: env.VITE_FB_AUTH_DOMAIN,
    projectId: env.VITE_FB_PROJECT_ID,
    appId: env.VITE_FB_APP_ID,
  };
  const measurementId = env.VITE_FB_MEASUREMENT_ID?.trim();
  if (measurementId) options.measurementId = measurementId;
  const app = name ? initializeApp(options, name) : initializeApp(options);

  // App Check goes first, so every later call to Auth, Firestore or AI Logic carries a token.
  // A debug token, for local runs and CI, is read by the SDK from self.FIREBASE_APPCHECK_DEBUG_TOKEN
  // when the test harness sets it; it is never part of the build.
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });

  const auth = getAuth(app);
  // The box stays readable offline and in sync across tabs; a browser without IndexedDB keeps it in memory.
  const db = initializeFirestore(app, {
    localCache: typeof indexedDB !== "undefined" && indexedDB
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
  });
  const functions = getFunctions(app, "us-central1");
  if (env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }

  // The SDK refuses a second AI instance for the same app and backend with a different token setting,
  // so the first call decides it and a different one later is a bug in the caller.
  let ai: { instance: AI; limited: boolean } | null = null;
  return {
    app,
    auth,
    db,
    functions,
    getAi(useLimitedUseTokens: boolean): AI {
      if (!ai) {
        ai = { instance: getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: useLimitedUseTokens }), limited: useLimitedUseTokens };
      } else if (ai.limited !== useLimitedUseTokens) {
        throw new FirebaseConfigError(`getAi was first called with useLimitedUseAppCheckTokens: ${ai.limited}; it cannot change to ${useLimitedUseTokens}`);
      }
      return ai.instance;
    },
  };
}

// Waits for Auth to restore a saved session first, so a reload keeps the same anonymous user.
export async function ensureSignedIn(auth: Auth): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const { user } = await signInAnonymously(auth);
  return user.uid;
}
