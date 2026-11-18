// App Check control for Firebase AI Logic: proves a raw generateContent call with no App Check token
// is refused (401) before it makes one that succeeds (200). AI Logic also requires a signed-in user, so
// the succeeding call carries a limited-use App Check token and an anonymous user's ID token, and the
// record shows that App Check without sign-in is refused too. Writes only status codes and reasons to
// evidence/appcheck-control/, never the API key or a token, and exits 1 unless it saw 401 and then 200.
//
// Env: VITE_FB_API_KEY, VITE_FB_PROJECT_ID, VITE_FB_APP_ID, APPCHECK_DEBUG_TOKEN.
// Optional: CONTROL_REFERER (the browser key only answers its allowed referrers; default localhost).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The smallest current model the Gemini Developer API serves through AI Logic, with a one-word reply.
const MODEL = "gemini-3.5-flash-lite";

// AI Logic enforces replay protection, so it accepts only limited-use App Check tokens.
export function exchangeRequest(debugToken: string): { debug_token: string; limited_use: true } {
  return { debug_token: debugToken, limited_use: true };
}

// The headers the SDK sends: the key and referrer, then App Check, then the signed-in user.
export function aiHeaders(apiKey: string, referer: string, appCheckToken?: string, idToken?: string): Record<string, string> {
  const h: Record<string, string> = { "x-goog-api-key": apiKey, Referer: referer };
  if (appCheckToken) h["X-Firebase-AppCheck"] = appCheckToken;
  if (idToken) h.Authorization = `Firebase ${idToken}`;
  return h;
}

export function controlPassed(noTokenStatus: number | null, withTokenStatus: number | null): boolean {
  return noTokenStatus === 401 && withTokenStatus === 200;
}

export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("<REDACTED>");
  return out;
}

interface Reply { status: number; body: Record<string, unknown> }

async function post(url: string, body: unknown, headers: Record<string, string>): Promise<Reply> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await r.text();
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { parsed = { raw: text.slice(0, 300) }; }
  return { status: r.status, body: parsed };
}

function errorSummary(body: Record<string, unknown>): { status?: unknown; message?: unknown } {
  const e = (body.error ?? {}) as Record<string, unknown>;
  return { status: e.status, message: e.message };
}

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function main(): Promise<void> {
  const apiKey = need("VITE_FB_API_KEY");
  const projectId = need("VITE_FB_PROJECT_ID");
  const appId = need("VITE_FB_APP_ID");
  const debugToken = need("APPCHECK_DEBUG_TOKEN");
  const referer = process.env.CONTROL_REFERER?.trim() || "http://localhost:5173/";
  const secrets = [apiKey, debugToken];
  const generate = `https://firebasevertexai.googleapis.com/v1beta/projects/${projectId}/models/${MODEL}:generateContent`;
  const prompt = { contents: [{ role: "user", parts: [{ text: "Reply with the single word ok." }] }], generationConfig: { maxOutputTokens: 8 } };

  const record: Record<string, unknown> = { ranAt: new Date().toISOString(), projectId, model: MODEL, referer };
  const none = await post(generate, prompt, aiHeaders(apiKey, referer));
  record.noToken = { status: none.status, error: errorSummary(none.body) };

  let withStatus: number | null = null;
  let appCheckToken = "";
  let idToken = "";
  let freshToken = "";
  if (none.status === 401) {
    const exchange = await post(
      `https://content-firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeDebugToken?key=${apiKey}`,
      exchangeRequest(debugToken), { Referer: referer });
    record.exchangeStatus = exchange.status;
    appCheckToken = typeof exchange.body.token === "string" ? exchange.body.token : "";
    if (appCheckToken) {
      // App Check alone, without a signed-in user, must be refused while authenticated-users mode is on.
      const appCheckOnly = await post(generate, prompt, aiHeaders(apiKey, referer, appCheckToken));
      record.appCheckWithoutSignIn = { status: appCheckOnly.status, error: errorSummary(appCheckOnly.body) };
      const signUp = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, { returnSecureToken: true }, { Referer: referer });
      record.anonymousSignInStatus = signUp.status;
      idToken = typeof signUp.body.idToken === "string" ? signUp.body.idToken : "";
      const second = idToken ? await post(
        `https://content-firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeDebugToken?key=${apiKey}`,
        exchangeRequest(debugToken), { Referer: referer }) : null;
      // Replay protection: each limited-use token works once, so the signed-in call gets a fresh one.
      freshToken = second && typeof second.body.token === "string" ? second.body.token : "";
      const ok = await post(generate, prompt, aiHeaders(apiKey, referer, freshToken, idToken));
      withStatus = ok.status;
      record.withToken = ok.status === 200 ? { status: 200, modelVersion: ok.body.modelVersion } : { status: ok.status, error: errorSummary(ok.body) };
    }
  } else {
    record.withToken = "not run: the call without a token was not refused with 401";
  }
  record.passed = controlPassed(none.status, withStatus);

  const dir = join(process.cwd(), "evidence", "appcheck-control");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${String(record.ranAt).replace(/[:.]/g, "-")}.json`);
  const json = redact(JSON.stringify(record, null, 2), [...secrets, appCheckToken, freshToken, idToken]) + "\n";
  writeFileSync(file, json);
  console.log(json);
  console.log(`wrote ${file}`);
  process.exit(record.passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
