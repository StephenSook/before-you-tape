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
const run = (items: BoxItemInput[], code: string, today = "2026-11-25", e: RuleEdition = ed) =>
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
      const v = run([thing], "CA", "2026-11-25", noDataRules).items.thing;
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
      [ed, "ZZ", "2026-11-25"], [ed, "CA", "2026-12-20"], [withCustomsUnchecked(ed, "CA"), "CA", "2026-11-25"], [ed, "CA", "2027-03-01"],
    ];
    for (const [e, code, today] of cases) {
      const v = evaluateBox([shirtConfirmed], e, resolveDestination(e, code), today).items.shirt;
      expect(v?.level, `${code} ${today}`).toBe("check");
      expect(v?.headline).toBe("Check this");
    }
  });

  it("a suspended country is never OK", () => {
    const e = withSuspended(ed, ["CA"]);
    const r = evaluateBox([shirtConfirmed], e, resolveDestination(e, "CA"), "2026-11-25");
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
      "perfume_alcohol", "aerosol", "power_bank", "lotion_ca", "lotion_ph", "phone_numbers_read_once_is_check", "laptop_plus_phone", "three_unknown_phones",
      "five_cells", "three_laptops", "used_phone", "wh_mismatch_exact", "coin_cell_toy", "unsure", "identity_unconfirmed",
      "unreviewed_country", "suspended_country", "stale_layer", "quantity_three", "millivolt_misread",
      "chocolate_bar_to_philippines_is_check", "chocolate_named_on_a_packaged_food_to_philippines_is_check",
      "margarine_to_philippines_is_check", "saved_chocolate_with_only_its_old_tag_to_philippines_is_check",
      "saved_margarine_with_only_its_old_tag_to_philippines_is_check", "chocolate_bar_to_canada_stays_ok",
      "ceramic_mug_to_canada_is_ok", "ceramic_mug_to_philippines_is_check", "porcelain_named_on_the_label_to_philippines_is_check",
      "sender_ticked_alcohol_settles_it", "replica_grenade_ca", "replica_grenade_ph", "plain_toy_ca",
      "sunscreen_stick_ph", "sunscreen_stick_ca", "sanitizer_drug_facts_ph",
      "replica_words_ca", "toy_and_brand_words_ca", "replica_props_ca", "replica_props_ph", "extra_questions_ca",
      "phone_numbers_matched_by_a_second_look_is_ok", "typed_item_that_sends_no_numbers_from_is_held", "battery_185_wh_true_numbers_is_take_out",
      "battery_185_wh_read_as_18_5_is_check", "battery_185_wh_read_ten_times_low_throughout_is_check", "laptop_120_wh_read_as_12_is_check",
      "coin_cell_grams_read_once_is_check", "not_lithium_answer_keeps_one_read_numbers_held",
      "identity_tap_does_not_clear_read_numbers", "category_pick_does_not_clear_read_numbers",
      "typed_laptop_without_label_text_is_ok",
      "typed_numbers_over_a_read_release_the_hold", "one_typed_number_over_a_read_is_mixed_and_held",
      "mixed_numbers_are_held_even_after_a_second_look", "typed_item_numbers_go_through_the_wh_rules", "typed_120_wh_laptop_is_take_out",
      "label_text_wh_that_disagrees_with_the_read_is_check", "label_text_grams_that_disagree_with_the_read_are_check",
      "typed_numbers_settle_a_label_text_mismatch", "typed_numbers_below_the_label_text_figure_hold", "label_text_wh_with_a_comma_that_agrees_is_ok",
      "label_number_typed_and_matched_makes_every_number_typed", "label_number_typed_and_different_replaces_the_read_and_holds",
      "blanking_one_number_does_not_make_the_rest_typed", "lithium_grams_on_a_li_ion_label_keep_the_wh_check",
      "a_label_naming_two_wh_figures_holds_when_one_disagrees", "a_figure_written_with_a_leading_point_reads_as_written",
      "a_5G_model_name_is_not_a_lithium_figure", "label_grams_typed_and_different_leave_mixed_numbers_held",
      "a_typed_wh_below_another_label_figure_still_holds", "a_typed_wh_at_the_largest_label_figure_settles_it",
      "a_net_weight_is_not_a_lithium_figure", "a_label_figure_just_over_the_limit_is_not_hidden_by_the_tolerance",
      "clearing_the_grams_keeps_the_label_lithium_figure", "a_label_wh_with_no_printed_wh_read_is_checked_against_volts_times_capacity",
      "a_lithium_metal_weight_is_a_lithium_figure", "a_net_weight_in_brackets_is_not_a_lithium_figure",
      "a_label_figure_a_little_over_the_limit_holds_both_reads", "a_device_weight_is_not_a_lithium_figure",
    ]);
    for (const v of vectors) {
      const r = run(v.items.map((i) => input(i as ItemSpec)), v.code, v.today);
      for (const [id, level] of Object.entries(v.expect)) expect(r.items[id]?.level, `${v.name} ${id}`).toBe(level);
      for (const [id, ids] of Object.entries((v as { expectRules?: Record<string, string[]> }).expectRules ?? {})) {
        expect(r.items[id]?.hits.map((h) => h.ruleId), `${v.name} ${id}`).toEqual(expect.arrayContaining(ids));
      }
      for (const [id, ids] of Object.entries((v as { notRules?: Record<string, string[]> }).notRules ?? {})) {
        for (const ruleId of ids) expect(r.items[id]?.hits.map((h) => h.ruleId), `${v.name} ${id}`).not.toContain(ruleId);
      }
      const lithium = (v as { expectLithium?: string }).expectLithium;
      if (lithium) expect(r.lithium.status, v.name).toBe(lithium);
      for (const [id, q] of Object.entries((v as { expectQuestion?: Record<string, string> }).expectQuestion ?? {})) {
        expect(r.items[id]?.question?.id, `${v.name} ${id}`).toBe(q);
      }
    }
  });

  it("never takes a second look as agreeing on numbers the two reads disputed, even once the dispute is settled", () => {
    // Not a shared vector: Android's engine input carries no disputes.
    const phone = { ...sealedPhoneOneCell, identityConfirmedBy: "second_look" as const };
    const settled = { ...phone, disputes: { battery: { device: { volts: 3.85, milliampHours: 4000, wattHours: 15.4 },
      cloud: { volts: 3.85, milliampHours: 4000, wattHours: 15.8 }, resolved: true } } };
    const v = run([settled], "CA").items.phone!;
    expect(v.level).toBe("check");
    expect(v.hits.map((h) => h.ruleId)).toContain("USPS-INTL-LI-ONE-READ");
    const grams = { ...phone, disputes: { lithiumGrams: { device: 0, cloud: 0, resolved: true } } };
    expect(run([grams], "CA").items.phone?.hits.map((h) => h.ruleId)).toContain("USPS-INTL-LI-ONE-READ");
    // A settled dispute about something else leaves the second look standing.
    const box = { ...phone, disputes: { retailBox: { device: "sealed" as const, cloud: "cannot_tell" as const, resolved: true } } };
    expect(run([box], "CA").items.phone?.level).toBe("ok");
  });

  it("holds a second look whose numbers disagree with the first read on the open dispute, not on the second look", () => {
    // Not a shared vector: only the web and the iPhone run second looks, so Android's engine input carries no disputes.
    const phone = { ...sealedPhoneOneCell, identityConfirmedBy: "second_look" as const };
    expect(run([phone], "CA").items.phone?.level).toBe("ok");
    const disputed = { ...phone, disputes: { battery: { device: { volts: 3.85, milliampHours: 4000, wattHours: 15.4 },
      cloud: { volts: 3.85, milliampHours: 40000, wattHours: 154 }, resolved: false } } };
    const v = run([disputed], "CA").items.phone!;
    expect(v.level).toBe("check");
    expect(v.hits.map((h) => h.ruleId)).toContain("DATA-DISPUTE");
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
      const v = run([watch], "CA", "2026-11-25", e).items.watch!;
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
        evaluateBox(items, counted, resolveDestination(ed, "PH"), "2026-11-25");
        return reads;
      };
      const small = box(100);
      expect(steps(box(400)) / steps(small)).toBeLessThan(6);
      expect(run(small, "PH").items["perfume-7"]!.question).toBeNull();
    });
  });
});

