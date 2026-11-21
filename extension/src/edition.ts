import bundled from "../../rules/edition.json";
import { parseEdition } from "../../src/engine/edition";
import type { RuleEdition } from "../../src/engine/types";

export const EDITION_URL = "https://before-you-tape-2026.web.app/edition.json";
export const bundledEdition = parseEdition(bundled);

export interface LoadedEdition {
  edition: RuleEdition;
  from: "live" | "cached" | "bundled";
  notice: string | null;
}

export async function loadEdition(input: {
  bundled: unknown;
  cached: unknown | null;
  fetchJson(): Promise<unknown>;
}): Promise<LoadedEdition> {
  try {
    return { edition: parseEdition(await input.fetchJson()), from: "live", notice: null };
  } catch {
    if (input.cached !== null) {
      try {
        return {
          edition: parseEdition(input.cached), from: "cached",
          notice: "Could not load the newest rules. Using saved rules.",
        };
      } catch {
        // An unreadable cache cannot replace the bundled rules.
      }
    }
    return {
      edition: parseEdition(input.bundled), from: "bundled",
      notice: "Could not load the newest rules. Using the built-in rules.",
    };
  }
}

export async function fetchCurrentEdition(signal: AbortSignal): Promise<unknown> {
  const response = await fetch(EDITION_URL, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
  });
  if (!response.ok) throw new Error("Could not load the newest rules.");
  return response.json();
}
