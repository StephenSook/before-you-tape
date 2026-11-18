import { describe, expect, it } from "vitest";
import { planPublish, refusals, type RcTemplate } from "./rc-publish";

const p = (value: string, valueType = "STRING", extra: Record<string, unknown> = {}) => ({ defaultValue: { value }, valueType, description: "a key", ...extra });
const live: RcTemplate = { parameters: { kill_cloud: p("true", "BOOLEAN"), cloud_model_item: p("gemini-3.5-flash-lite"), live_only: p("x") } };
const local: RcTemplate = { parameters: { kill_cloud: p("false", "BOOLEAN"), cloud_model_item: p("gemini-3.5-flash-lite"), new_key: p("") } };

describe("planPublish", () => {
  it("sorts every key into added, changed, dropped or the same", () =>
    expect(planPublish(live, local)).toEqual({
      added: ["new_key"],
      changed: [{ key: "kill_cloud", live: "true", local: "false" }],
      dropped: ["live_only"],
      same: ["cloud_model_item"],
    }));

  it("counts a changed type or a live conditional value as a change, and a new description as the same", () => {
    const withCondition: RcTemplate = { parameters: { k: p("a", "STRING", { conditionalValues: { phones: { value: "b" } } }) } };
    expect(planPublish(withCondition, { parameters: { k: p("a") } }).changed.map((c) => c.key)).toEqual(["k"]);
    expect(planPublish({ parameters: { k: p("1", "NUMBER") } }, { parameters: { k: p("1") } }).changed.map((c) => c.key)).toEqual(["k"]);
    expect(planPublish({ parameters: { k: p("a") } }, { parameters: { k: { ...p("a"), description: "new words" } } }).same).toEqual(["k"]);
  });
});

describe("refusals", () => {
  it("refuses a changed or dropped live value unless it is allowed by name", () => {
    const plan = planPublish(live, local);
    expect(refusals(plan, new Set())).toEqual(["kill_cloud", "live_only"]);
    expect(refusals(plan, new Set(["kill_cloud"]))).toEqual(["live_only"]);
    expect(refusals(plan, new Set(["kill_cloud", "live_only"]))).toEqual([]);
    expect(refusals(planPublish(local, local), new Set())).toEqual([]);
  });
});
