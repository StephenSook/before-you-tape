import { describe, expect, it } from "vitest";
import vectors from "../../tests/vectors/box.json";
import defaults from "../../tests/vectors/defaults.json";
import { ed, withCustomsUnchecked, withSuspended } from "../../tests/engine/helpers";
import type { ItemRead } from "../shared/itemRead";
import { resolveDestination } from "./edition";
import { TWO_BOX_NOTE } from "./lithiumBox";
import type { BoxItemInput, RuleEdition } from "./types";
import { evaluateBox } from "./verdict";

// The defaults a vector leaves out, shared with the native clients' vector runners.
const baseRead = defaults.baseRead as ItemRead;
const itemDefaults = defaults.itemDefaults as Omit<BoxItemInput, "itemId" | "read">;
type ItemSpec = Partial<Omit<BoxItemInput, "read">> & { itemId: string; read: Partial<ItemRead> };
const input = (s: ItemSpec): BoxItemInput => ({
  ...structuredClone(itemDefaults), ...s, read: { ...baseRead, ...s.read },
});
const run = (items: BoxItemInput[], code: string, today = "2026-11-20", e: RuleEdition = ed) =>
  evaluateBox(items, e, resolveDestination(e, code), today);

const lotion = input({ itemId: "lotion", read: { category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", liquid: true } });
const phoneRead = (r: Partial<ItemRead>) =>
  input({ itemId: "phone", read: { category: "phone", batteryWords: true, labelText: "PHONE BATTERY", ...r }, answers: { device_condition: "new_sealed", cell_count: "one" } });
const shirtSeenOnly = input({ itemId: "shirt", read: { category: "clothing", evidence: "item_seen" } });
const shirtConfirmed = input({ itemId: "shirt", read: { category: "clothing", evidence: "item_seen" }, identityConfirmedBy: "sender" });
const sealedLaptop = input({ itemId: "laptop", read: { category: "laptop", labelText: "11.55V 4380mAh 50.6Wh", volts: 11.55,
  milliampHours: 4380, wattHours: 50.6, batteryWords: true, retailBox: "sealed" }, answers: { device_condition: "new_sealed" } });
const sealedPhoneOneCell = phoneRead({ volts: 3.85, milliampHours: 4000, wattHours: 15.4, labelText: "3.85V 4000mAh 15.4Wh", retailBox: "sealed" });
const unknownPhone = (id: string) => input({ itemId: id, read: { category: "phone", labelText: "3.85V 4000mAh 15.4Wh", volts: 3.85,
  milliampHours: 4000, wattHours: 15.4, batteryWords: true }, answers: { device_condition: "new_sealed" } });
const [phoneA, phoneB, phoneC] = [unknownPhone("phoneA"), unknownPhone("phoneB"), unknownPhone("phoneC")];

describe("evaluateBox", () => {
  it("flips lotion between countries", () => {
    expect(run([lotion], "CA").items.lotion?.headline).toBe("OK to pack");
    expect(run([lotion], "PH").items.lotion?.headline).toBe("Take it out");
  });

  it("sends the exact measured misread to Check this", () => {
    const r = run([phoneRead({ volts: 3.7, milliampHours: 2500, wattHours: 9.62 })], "CA");
    expect(r.items.phone?.level).toBe("check");
    expect(r.items.phone?.hits.map((h) => h.ruleId)).toContain("USPS-INTL-LI-WH-MISMATCH");
  });

  it("holds an item at Check this while its two reads disagree, and never lowers a Take it out", () => {
    const open: BoxItemInput["disputes"] = { category: { device: "power_bank", cloud: "lotion_cream", resolved: false } };
    const disputed = run([{ ...lotion, disputes: open }], "CA").items.lotion;
    expect(disputed?.level).toBe("check");
    expect(disputed?.hits[0]?.ruleId).toBe("DATA-DISPUTE");
    // The sender confirmed the reading: nothing is left to check.
    const settled: BoxItemInput["disputes"] = { category: { device: "power_bank", cloud: "lotion_cream", resolved: true } };
    expect(run([{ ...lotion, disputes: settled }], "CA").items.lotion?.level).toBe("ok");
    expect(run([{ ...lotion, disputes: open }], "PH").items.lotion?.level).toBe("take_out");
  });

  it("never says OK on a category alone", () => {
    const r = run([shirtSeenOnly], "CA");
    expect(r.items.shirt?.level).toBe("check");
    expect(r.items.shirt?.hits[0]?.ruleId).toBe("DATA-IDENTITY");
    expect(run([shirtConfirmed], "CA").items.shirt?.level).toBe("ok");
  });

  it("never says OK for an unsure read or an unnamed item, even with no data rules in the edition", () => {
    const noDataRules: RuleEdition = { ...ed, rules: ed.rules.filter((r) => r.layer !== "data") };
    for (const read of [{ category: "toy" as const, evidence: "not_sure" as const }, { category: "other" as const, evidence: "item_seen" as const }]) {
      const thing = input({ itemId: "thing", read, identityConfirmedBy: "sender" });
      const v = run([thing], "CA", "2026-11-20", noDataRules).items.thing;
      expect(v?.level, read.category).toBe("check");
      expect(v?.hits.map((h) => h.ruleId)).toContain("DATA-UNSURE");
    }
  });

  it("checks a laptop with a single-cell phone and says the two-box limit", () => {
    const r = run([sealedLaptop, sealedPhoneOneCell], "CA");
    expect(r.lithium.status).toBe("mixed");
    expect(r.items.laptop?.level).toBe("check");
    expect(r.items.phone?.level).toBe("check");
    expect(r.lithium.text).toContain(TWO_BOX_NOTE);
  });

  it("asks the cell question when the count depends on it", () =>
    expect(run([phoneA, phoneB, phoneC], "CA").items.phoneA?.question?.id).toBe("cell_count"));

  it("never OK with a missing or stale layer", () => {
    const cases: Array<[RuleEdition, string, string]> = [
      [ed, "ZZ", "2026-11-20"], [ed, "CA", "2026-12-20"], [withCustomsUnchecked(ed, "CA"), "CA", "2026-11-20"], [ed, "CA", "2027-03-01"],
    ];
    for (const [e, code, today] of cases) {
      const v = evaluateBox([shirtConfirmed], e, resolveDestination(e, code), today).items.shirt;
      expect(v?.level, `${code} ${today}`).toBe("check");
      expect(v?.headline).toBe("Check this");
    }
  });

  it("a suspended country is never OK", () => {
    const e = withSuspended(ed, ["CA"]);
    const r = evaluateBox([shirtConfirmed], e, resolveDestination(e, "CA"), "2026-11-20");
    expect(r.destination.suspended).toBe(true);
    expect(r.items.shirt?.level).toBe("check");
    expect(r.items.shirt?.hits.map((h) => h.ruleId)).toContain("DEST-SUSPENDED");
    expect(r.counts.ok).toBe(0);
  });

  it("names the service and the four layers on an OK", () => {
    const v = run([shirtConfirmed], "CA").items.shirt;
    expect(v?.service).toBe("Priority Mail International");
    expect(v?.layers).toHaveLength(4);
    expect(v?.layers.every((l) => l.state === "checked")).toBe(true);
  });

  it("does not depend on item order", () => expect(run([lotion, shirtConfirmed], "PH").items).toEqual(run([shirtConfirmed, lotion], "PH").items));

  it("counts verdicts and carries the edition id", () => {
    const r = run([lotion, shirtSeenOnly, input({ itemId: "spray", read: { category: "aerosol_spray", pressurized: true, labelText: "SPRAY" } })], "CA");
    expect(r.counts).toEqual({ ok: 1, check: 1, takeOut: 1 });
    expect(r.editionId).toBe(ed.editionId);
  });

  it("adds the box notes only when a lithium battery is in the box", () => {
    expect(run([lotion], "CA").notes).toEqual([]);
    expect(run([sealedPhoneOneCell], "CA").notes.map((n) => n.ruleId)).toEqual(["USPS-INTL-LI-NO-MARKING", "USPS-INTL-LI-TWO-BOXES"]);
  });

  it("leaves a taken-out battery out of the box count", () => {
    const pb = input({ itemId: "pb", read: { category: "power_bank", batteryWords: true, labelText: "POWER BANK" } });
    const r = run([pb, sealedLaptop], "CA");
    expect(r.items.pb?.level).toBe("take_out");
    expect(r.lithium.itemIds).toEqual(["laptop"]);
  });

  it("gives the expected verdict for every named box vector", () => {
    expect(vectors.map((v) => v.name)).toEqual([
      "perfume_alcohol", "aerosol", "power_bank", "lotion_ca", "lotion_ph", "phone_ok", "laptop_plus_phone", "three_unknown_phones",
      "five_cells", "three_laptops", "used_phone", "wh_mismatch_exact", "coin_cell_toy", "unsure", "identity_unconfirmed",
      "unreviewed_country", "suspended_country", "stale_layer", "quantity_three", "millivolt_misread",
      "chocolate_bar_to_philippines_is_check", "chocolate_named_on_a_packaged_food_to_philippines_is_check",
      "margarine_to_philippines_is_check", "saved_chocolate_with_only_its_old_tag_to_philippines_is_check",
      "saved_margarine_with_only_its_old_tag_to_philippines_is_check", "chocolate_bar_to_canada_stays_ok",
      "ceramic_mug_to_canada_is_ok", "ceramic_mug_to_philippines_is_check", "porcelain_named_on_the_label_to_philippines_is_check",
      "sender_ticked_alcohol_settles_it", "replica_grenade_ca", "replica_grenade_ph", "plain_toy_ca",
    ]);
    for (const v of vectors) {
      const r = run(v.items.map((i) => input(i as ItemSpec)), v.code, v.today);
      for (const [id, level] of Object.entries(v.expect)) expect(r.items[id]?.level, `${v.name} ${id}`).toBe(level);
      for (const [id, ids] of Object.entries((v as { expectRules?: Record<string, string[]> }).expectRules ?? {})) {
        expect(r.items[id]?.hits.map((h) => h.ruleId), `${v.name} ${id}`).toEqual(expect.arrayContaining(ids));
      }
      const lithium = (v as { expectLithium?: string }).expectLithium;
      if (lithium) expect(r.lithium.status, v.name).toBe(lithium);
      for (const [id, q] of Object.entries((v as { expectQuestion?: Record<string, string> }).expectQuestion ?? {})) {
        expect(r.items[id]?.question?.id, `${v.name} ${id}`).toBe(q);
      }
    }
  });

  describe("a question no answer can change", () => {
    const perfume = input({ itemId: "perfume", read: { category: "perfume_fragrance", labelText: "EAU DE PARFUM 100 mL", liquid: true, glassContainer: true } });

    it("is not asked once another rule has taken the item out, whatever the answer", () => {
      const v = run([perfume], "PH").items.perfume!;
      expect(v.level).toBe("take_out");
      expect(v.question).toBeNull();
      expect(v.hits.some((h) => h.askId !== undefined)).toBe(false);
      expect(v.hits.map((h) => h.ruleId)).toContain("PH-P-01");
    });

    it("is still asked where its answer can change the verdict", () => {
      const v = run([perfume], "CA").items.perfume!;
      expect(v.question?.id).toBe("label_alcohol");
    });

    it("is still asked when its answer would change another item in the box", () => {
      // Three phones with multi-cell batteries are over the box's limit; a "Used" answer would take one out of the
      // lithium count and change the other two.
      const phones = ["a", "b", "c"].map((id) => input({ itemId: id, read: { category: "phone", batteryWords: true, labelText: "7.7V 5000mAh 38.5Wh",
        volts: 7.7, milliampHours: 5000, wattHours: 38.5 }, answers: { cell_count: "more_than_one" } }));
      const r = run(phones, "CA");
      for (const id of ["a", "b", "c"]) {
        expect(r.items[id]!.level, id).toBe("take_out");
        expect(r.items[id]!.question?.id, id).toBe("device_condition");
      }
    });

    it("never leaves a Take it out without the hit that decides it", () => {
      const e = structuredClone(ed);
      const rule = e.rules.find((x) => x.id === "USPS-INTL-LI-METAL-CLASS")!;
      rule.outcome = "take_out";
      const watch = input({ itemId: "watch", quantity: 5, read: { category: "smartwatch", batteryWords: true, labelText: "LITHIUM METAL 1.5 g", lithiumGrams: 1.5,
        retailBox: "sealed" }, answers: { device_condition: "new_sealed" } });
      const v = run([watch], "CA", "2026-11-20", e).items.watch!;
      if (v.level === "take_out") expect(v.hits.some((h) => h.level === "take_out")).toBe(true);
    });

    it("does work in step with the box, not with its square, for items with no battery", () => {
      // Counted, not timed, so a busy machine cannot change the answer: every read of the rule edition is a step
      // of work. Four times the items take about four times the steps; judging each item against the whole box
      // would take about sixteen.
      const box = (n: number) => Array.from({ length: n }, (_, k) => ({ ...perfume, itemId: `perfume-${k}` }));
      const steps = (items: BoxItemInput[]) => {
        let reads = 0;
        const counted = new Proxy(ed, { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver) as unknown; } });
        evaluateBox(items, counted, resolveDestination(ed, "PH"), "2026-11-20");
        return reads;
      };
      const small = box(100);
      expect(steps(box(400)) / steps(small)).toBeLessThan(6);
      expect(run(small, "PH").items["perfume-7"]!.question).toBeNull();
    });
  });
});

