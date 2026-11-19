// The QR handoff's two callables. Each call carries a limited-use App Check token (the server uses each
// token once) and waits for anonymous sign-in, since the server needs to know who is joining.
import { httpsCallable, type Functions } from "firebase/functions";

export interface JoinClient {
  startJoin(boxId: string): Promise<{ key: string; expiresAt: number }>;
  joinBox(boxId: string, key: string): Promise<{ boxId: string; joined: boolean }>;
}

export function joinClient(functions: Functions, signIn: Promise<string>): JoinClient {
  const start = httpsCallable<{ boxId: string }, { key: string; expiresAt: number }>(functions, "startJoin", { limitedUseAppCheckTokens: true });
  const join = httpsCallable<{ boxId: string; key: string }, { boxId: string; joined: boolean }>(functions, "joinBox", { limitedUseAppCheckTokens: true });
  return {
    async startJoin(boxId) {
      await signIn;
      return (await start({ boxId })).data;
    },
    async joinBox(boxId, key) {
      await signIn;
      return (await join({ boxId, key })).data;
    },
  };
}

// The server words its own refusals plainly (a used code, an expired one, a full box); anything else, such
// as no connection or a refused App Check token, gets one plain line.
const SERVER_WORDED = new Set(["functions/permission-denied", "functions/deadline-exceeded", "functions/resource-exhausted", "functions/not-found", "functions/invalid-argument"]);

export function joinErrorText(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  const message = (e as { message?: unknown } | null)?.message;
  if (typeof code === "string" && SERVER_WORDED.has(code) && typeof message === "string" && message !== "") return message;
  return "That did not work. Check the connection and try again.";
}
