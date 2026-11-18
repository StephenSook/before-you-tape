// The cloud models this app may send to Firebase AI Logic. Remote Config can choose among them; any other
// name keeps the in-app default, so a typo or a shut-down model is never sent. Each entry records the
// status read on the models page and the date it was read; re-read it before adding or keeping a model.
const MODELS_PAGE = "https://firebase.google.com/docs/ai-logic/models";

export const CLOUD_MODELS = [
  // Released 2026-07-21. Also checked through AI Logic with App Check by the live reads in docs/evidence.
  { name: "gemini-3.5-flash-lite", stage: "Stable", shutdown: "none listed", checked: "2026-11-18", source: MODELS_PAGE },
  // Released 2026-09-02. Checked through AI Logic with App Check on 2026-11-18: 401 without a token, 200 with one.
  { name: "gemini-3.8-flash", stage: "Stable", shutdown: "none listed", checked: "2026-11-18", source: MODELS_PAGE },
] as const;

export function isAllowedCloudModel(name: string): boolean {
  return CLOUD_MODELS.some((m) => m.name === name);
}
