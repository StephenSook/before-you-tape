import { describe, expect, it } from "vitest";
import { newestRun } from "./ran-eval";

describe("newestRun", () => {
  it("picks the public model run with the latest date, ignoring baselines and private runs", () => {
    expect(newestRun(["README.md", "models-2026-11-21.public.json", "rules_only-2026-11-30.json", "models-2026-11-23.public.json", "models-2026-11-22.json"]))
      .toBe("models-2026-11-23.public.json");
  });

  it("finds none when there is no public model run", () => {
    expect(newestRun(["README.md", "always_check-2026-11-21.json"])).toBeNull();
  });
});
