"use strict";
var BYT = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj2, key, value) => key in obj2 ? __defProp(obj2, key, { enumerable: true, configurable: true, writable: true, value }) : obj2[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj2, key, value) => __defNormalProp(obj2, typeof key !== "symbol" ? key + "" : key, value);

  // src/embed/bridge.ts
  var bridge_exports = {};
  __export(bridge_exports, {
    BRIDGE_VERSION: () => BRIDGE_VERSION,
    canonicalEdition: () => canonicalEdition,
    destinationHitsJson: () => destinationHitsJson,
    editionBodyCanonical: () => editionBodyCanonical,
    evaluateBoxJson: () => evaluateBoxJson,
    isNoItemJson: () => isNoItemJson,
    itemReadContract: () => itemReadContract,
    labelTagsJson: () => labelTagsJson,
    mergeSecondLookJson: () => mergeSecondLookJson,
    parseItemReadJson: () => parseItemReadJson,
    parseItemReadTaggedJson: () => parseItemReadTaggedJson,
    secondLookReasonJson: () => secondLookReasonJson,
    setEdition: () => setEdition
  });

  // src/shared/itemRead.ts
  var ITEM_CATEGORIES = [
    "perfume_fragrance",
    "nail_polish",
    "aerosol_spray",
    "hand_sanitizer",
    "lotion_cream",
    "liquid_toiletry",
    "makeup",
    "powder",
    "medicine",
    "alcohol_drink",
    "food_packaged",
    "chocolate",
    "coffee",
    "cooking_oil",
    "meat_product",
    "phone",
    "tablet",
    "laptop",
    "smartwatch",
    "earbuds",
    "power_bank",
    "loose_battery",
    "battery_toy",
    "musical_card",
    "other_electronics",
    "lighter_matches",
    "e_cigarette",
    "glue_paint",
    "knife_tool",
    "toy_gun",
    "candle",
    "jewelry_watch",
    "clothing",
    "shoes",
    "book_paper",
    "toy",
    "ceramic",
    "other"
  ];
  var RETAIL_BOX_VALUES = ["sealed", "open_or_none", "cannot_tell"];
  var EVIDENCE_VALUES = ["label_read", "item_seen", "not_sure"];
  var LABEL_TEXT_MAX = 160;
  var ITEM_READ_FIELDS = [
    { name: "itemName", kind: "string" },
    { name: "category", kind: "enum", values: ITEM_CATEGORIES },
    { name: "labelText", kind: "string" },
    { name: "volts", kind: "number" },
    { name: "milliampHours", kind: "number" },
    { name: "wattHours", kind: "number" },
    { name: "lithiumGrams", kind: "number" },
    { name: "batteryWords", kind: "boolean" },
    { name: "liquid", kind: "boolean" },
    { name: "pressurized", kind: "boolean" },
    { name: "alcoholOnLabel", kind: "boolean" },
    { name: "flammableOnLabel", kind: "boolean" },
    { name: "glassContainer", kind: "boolean" },
    { name: "powder", kind: "boolean" },
    { name: "retailBox", kind: "enum", values: RETAIL_BOX_VALUES },
    { name: "evidence", kind: "enum", values: EVIDENCE_VALUES }
  ];
  var InvalidReadError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "InvalidReadError";
    }
  };
  function itemReadJsonSchema() {
    const properties = {};
    for (const f of ITEM_READ_FIELDS) {
      properties[f.name] = f.kind === "enum" ? { type: "string", enum: [...f.values ?? []] } : { type: f.kind };
    }
    return {
      type: "object",
      properties,
      required: ITEM_READ_FIELDS.map((f) => f.name),
      additionalProperties: false
    };
  }
  function checkField(f, value) {
    const bad = (why) => new InvalidReadError(`${f.name}: ${why}`);
    switch (f.kind) {
      case "string":
        if (typeof value !== "string") throw bad("expected a string");
        return;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw bad("expected a number 0 or more");
        return;
      case "boolean":
        if (typeof value !== "boolean") throw bad("expected true or false");
        return;
      case "enum":
        if (typeof value !== "string" || !f.values?.includes(value)) throw bad("not an allowed value");
        return;
    }
  }
  function parseItemRead(text) {
    return parseItemReadWithLabel(text).read;
  }
  function parseItemReadWithLabel(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new InvalidReadError("the reply is not JSON");
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new InvalidReadError("the reply is not a JSON object");
    }
    const record = data;
    const known = new Set(ITEM_READ_FIELDS.map((f) => f.name));
    for (const key of Object.keys(record)) {
      if (!known.has(key)) throw new InvalidReadError(`${key}: not a field of the item read`);
    }
    for (const f of ITEM_READ_FIELDS) {
      if (!(f.name in record)) throw new InvalidReadError(`${f.name}: missing`);
      checkField(f, record[f.name]);
    }
    const read = record;
    return { read: { ...read, labelText: Array.from(read.labelText).slice(0, LABEL_TEXT_MAX).join("") }, fullLabelText: read.labelText };
  }

  // src/engine/battery.ts
  var RANGE = { volts: [1, 60], milliampHours: [10, 1e5], wattHours: [0.05, 400] };
  var BATTERY_DEVICES = /* @__PURE__ */ new Set(["phone", "tablet", "laptop", "smartwatch", "earbuds"]);
  var MAYBE_BATTERY_DEVICES = /* @__PURE__ */ new Set([
    "battery_toy",
    "musical_card",
    "other_electronics",
    "e_cigarette"
  ]);
  var LOOSE_CATEGORIES = /* @__PURE__ */ new Set(["power_bank", "loose_battery"]);
  var isNumber = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  var printed = (n) => isNumber(n) && n > 0 ? n : null;
  var inRange = (n, [lo, hi]) => n === null || n >= lo && n <= hi;
  var round2 = (n) => Math.round(n * 100) / 100;
  function crossCheckWh(volts, milliampHours, whPrinted, tolerancePct) {
    const computed = volts * milliampHours / 1e3;
    const diffPct = Math.abs(computed - whPrinted) / whPrinted * 100;
    return diffPct > tolerancePct ? "printed_mismatch" : "printed_matches";
  }
  function presenceOf(read, answers, hasEvidence, lithiumEvidence, tags) {
    if (LOOSE_CATEGORIES.has(read.category)) return "loose";
    if (tags.includes("power_bank_label")) return "loose";
    const answer = answers.battery_installed;
    if (answer === "loose" || answer === "packed_beside") return answer;
    if (BATTERY_DEVICES.has(read.category)) return "installed";
    if (answer === "installed") return "installed";
    if ((answer === "none" || answer === "not_lithium") && !lithiumEvidence) return "none";
    if (MAYBE_BATTERY_DEVICES.has(read.category)) return lithiumEvidence ? "installed" : "unknown";
    return hasEvidence ? "unknown" : "none";
  }
  var BATTERY_NUMBER_FIELDS = ["volts", "milliampHours", "wattHours", "lithiumGrams"];
  function numbersFromOf(read, typed) {
    const present = BATTERY_NUMBER_FIELDS.filter((f) => printed(read[f]) !== null);
    const typedCount = present.filter((f) => typed.has(f)).length;
    return present.length === 0 || typedCount === 0 ? "read" : typedCount === present.length ? "typed" : "mixed";
  }
  var WH_IN_LABEL = /(\d*[.,]?\d+)\s*wh\b/gi;
  var GRAMS_IN_LABEL = /(\d*[.,]?\d+)\s*g\b/g;
  var figures = (text, re) => [...text.matchAll(re)].map((m) => Number(m[1].replace(",", "."))).filter((n) => Number.isFinite(n) && n > 0);
  function labelFiguresOf(text) {
    return { wh: figures(text, WH_IN_LABEL), grams: figures(text, GRAMS_IN_LABEL) };
  }
  var agrees = (a, b, tolerancePct) => Math.abs(a - b) / b * 100 <= tolerancePct;
  function labelMismatchOf(figs, typed, whPrinted, lithiumGrams, tolerancePct) {
    if (whPrinted !== null && !typed.has("wattHours")) {
      const off = figs.wh.find((n) => !agrees(n, whPrinted, tolerancePct));
      if (off !== void 0) return { kind: "wh", label: off, read: whPrinted };
    }
    if (lithiumGrams !== null && !typed.has("lithiumGrams")) {
      const off = figs.grams.find((n) => !agrees(n, lithiumGrams, tolerancePct));
      if (off !== void 0) return { kind: "grams", label: off, read: lithiumGrams };
    }
    return null;
  }
  function deriveBattery(read, answers, quantity, limits, tags, typed = /* @__PURE__ */ new Set(), figs = labelFiguresOf(read.labelText)) {
    const volts = printed(read.volts);
    const milliampHours = printed(read.milliampHours);
    const whPrinted = printed(read.wattHours);
    const whComputed = volts !== null && milliampHours !== null ? round2(volts * milliampHours / 1e3) : null;
    const lithiumGrams = printed(read.lithiumGrams);
    const liIon = tags.includes("li_ion");
    const liMetal = tags.includes("li_metal") || lithiumGrams !== null && !liIon;
    const anyNumber = volts !== null || milliampHours !== null || whPrinted !== null || lithiumGrams !== null;
    const labelEvidence = liMetal || liIon || tags.includes("battery_label") || tags.includes("power_bank_label");
    const badNumber = [read.volts, read.milliampHours, read.wattHours, read.lithiumGrams].some((n) => !isNumber(n));
    const hasEvidence = read.batteryWords || anyNumber || labelEvidence || badNumber;
    const lithiumEvidence = milliampHours !== null || whPrinted !== null || liMetal || liIon || tags.includes("power_bank_label");
    let whStatus;
    if (badNumber || !inRange(volts, RANGE.volts) || !inRange(milliampHours, RANGE.milliampHours) || !inRange(whPrinted, RANGE.wattHours)) {
      whStatus = "implausible";
    } else if (whPrinted !== null && volts !== null && milliampHours !== null) {
      whStatus = crossCheckWh(volts, milliampHours, whPrinted, limits.whTolerancePct);
    } else if (whPrinted !== null) {
      whStatus = "printed_only";
    } else if (whComputed !== null) {
      whStatus = "computed_only";
    } else {
      whStatus = "none";
    }
    const wh = whStatus === "printed_matches" || whStatus === "printed_only" ? whPrinted : null;
    let countAs = "unknown";
    const cellAnswer = answers.cell_count;
    if (cellAnswer === "one") countAs = "cell";
    else if (cellAnswer === "more_than_one") countAs = "battery";
    else if (whStatus !== "implausible") {
      const bestWh = wh ?? whPrinted ?? whComputed;
      if (volts !== null && volts > limits.seriesVoltsThreshold || bestWh !== null && bestWh > limits.cellMaxWh) {
        countAs = "battery";
      }
    }
    const presence = presenceOf(read, answers, hasEvidence, lithiumEvidence, tags);
    let chemistry = "unknown";
    if (liMetal) chemistry = "li_metal";
    else if (liIon) chemistry = "li_ion";
    else if (answers.battery_installed === "not_lithium" && !BATTERY_DEVICES.has(read.category)) chemistry = "not_lithium";
    else if (anyNumber || BATTERY_DEVICES.has(read.category) || LOOSE_CATEGORIES.has(read.category)) chemistry = "li_ion";
    return {
      presence,
      chemistry,
      volts,
      milliampHours,
      whPrinted,
      whComputed,
      whStatus,
      wh,
      lithiumGrams,
      countAs,
      units: quantity,
      numbersFrom: numbersFromOf(read, typed),
      labelMismatch: presence === "none" ? null : labelMismatchOf(figs, typed, whPrinted, lithiumGrams, limits.whTolerancePct)
    };
  }

  // src/engine/facts.ts
  var LABEL_TEXT_TAG = "label_text";
  var FLAG_TAGS = [
    ["liquid", "liquid"],
    ["pressurized", "pressurized"],
    ["alcoholOnLabel", "alcohol_flag"],
    ["flammableOnLabel", "flammable"],
    ["glassContainer", "glass_fragile"],
    ["powder", "powder"]
  ];
  var ALCOHOL_FREE_UNSURE_TAG = "alcohol_free_unsure";
  var ENGINE_TAGS = [LABEL_TEXT_TAG, ALCOHOL_FREE_UNSURE_TAG, ...FLAG_TAGS.map(([, tag]) => tag)];
  var patternCache = /* @__PURE__ */ new Map();
  function wholeWord(pattern) {
    let re = patternCache.get(pattern);
    if (!re) {
      re = new RegExp(`\\b(?:${pattern})\\b`, "gi");
      patternCache.set(pattern, re);
    }
    return re;
  }
  function normalizeLabel(text) {
    return text.normalize("NFKC").replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, "-").replace(/[^\S\n]+/g, " ").replace(/ ?\n[\s]*/g, "\n").trim();
  }
  var NEGATED_BEFORE = / ?(?:\b(?:no|non|not|without|zero|free of|free from) ?-? ?|\b0(?:\.0+)? ?% ?)$/i;
  var NEGATED_AFTER = /^ ?(?:-? ?|- ?\n ?)free\b(?! (?:from|of)\b)/i;
  var FREE_AFTER_BREAK = /^\n ?-? ?free\b(?! (?:from|of)\b)/i;
  var LINE_END_HYPHEN = /(\p{L})-\n(?=\p{L})/gu;
  function labelTagsOf(labelText, edition2) {
    const text = normalizeLabel(labelText);
    if (text === "") return [];
    const tags = /* @__PURE__ */ new Set([LABEL_TEXT_TAG]);
    addWordTags(text, edition2, tags);
    const joined = text.replace(LINE_END_HYPHEN, "$1");
    if (joined !== text) addWordTags(joined, edition2, tags);
    return [...tags].sort();
  }
  function addWordTags(text, edition2, tags) {
    const matchText = text.replace(/\n/g, " ");
    for (const w of edition2.labelWords) {
      if (tags.has(w.tag)) continue;
      let freeAfterBreak = false;
      for (const m of matchText.matchAll(wholeWord(w.pattern))) {
        const before = text.slice(Math.max(0, m.index - 12), m.index);
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12);
        if (NEGATED_BEFORE.test(before) || NEGATED_AFTER.test(after)) continue;
        if (FREE_AFTER_BREAK.test(after)) {
          freeAfterBreak = true;
          continue;
        }
        tags.add(w.tag);
        break;
      }
      if (freeAfterBreak && !tags.has(w.tag)) tags.add(w.tag === "alcohol" ? ALCOHOL_FREE_UNSURE_TAG : w.tag);
    }
  }
  function conditionOf(answer) {
    return answer === "new_sealed" || answer === "new_opened" || answer === "used" || answer === "refurbished_certified" ? answer : "unknown";
  }
  function typedNumbers(input) {
    return new Set(BATTERY_NUMBER_FIELDS.filter((f) => input.numbersFrom === "typed" || input.overrides[f] !== void 0));
  }
  function labelFigures(input) {
    const kept = input.labelFigures ?? labelFiguresOf(input.read.labelText);
    const typed = labelFiguresOf(input.overrides.labelText ?? "");
    return { wh: [...kept.wh, ...typed.wh], grams: [...kept.grams, ...typed.grams] };
  }
  function deriveFacts(input, edition2) {
    const read = { ...input.read, ...input.overrides };
    const tags = new Set(edition2.categoryTags[read.category]);
    for (const [flag, tag] of FLAG_TAGS) if (read[flag]) tags.add(tag);
    const savedTagsCoverLabel = input.overrides.labelText === void 0 && input.labelTags.includes(LABEL_TEXT_TAG);
    if (!savedTagsCoverLabel) for (const t of labelTagsOf(read.labelText, edition2)) tags.add(t);
    if (input.overrides.labelText === void 0) for (const t of input.labelTags) tags.add(t);
    const freeAnswer = input.answers.label_alcohol_free;
    const freeUnsure = tags.has(ALCOHOL_FREE_UNSURE_TAG) && !tags.has("alcohol");
    if (freeUnsure && freeAnswer === "no") tags.add("alcohol");
    const tagList = [...tags].sort();
    const answer = input.answers.label_alcohol;
    const senderSaysAlcohol = input.overrides.alcoholOnLabel === true;
    const cleared = answer === "no" || freeUnsure && freeAnswer === "yes";
    const alcohol = tags.has("alcohol") || answer === "yes" || senderSaysAlcohol ? "yes" : cleared ? "no" : "unknown";
    let identity = "unconfirmed";
    if (input.identityConfirmedBy) identity = input.identityConfirmedBy;
    else if (read.evidence === "label_read" && tags.has(LABEL_TEXT_TAG)) identity = "label";
    if (identity === "second_look" && (input.disputes?.battery !== void 0 || input.disputes?.lithiumGrams !== void 0)) identity = "sender";
    return {
      category: read.category,
      tags: tagList,
      evidence: read.evidence,
      identity,
      battery: deriveBattery(read, input.answers, input.quantity, edition2.limits, tagList, typedNumbers(input), labelFigures(input)),
      // The photo outranks a saved answer: a device seen out of its box is not "still sealed". Fixing
      // the box reading (an override to "sealed") is how the sender clears it.
      condition: conditionOf(input.answers.device_condition) === "new_sealed" && read.retailBox === "open_or_none" ? "new_opened" : conditionOf(input.answers.device_condition),
      alcohol,
      quantity: input.quantity
    };
  }

  // src/engine/edition.ts
  var EditionError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "EditionError";
    }
  };
  var fail = (where, why) => {
    throw new EditionError(`${where}: ${why}`);
  };
  function obj(v, where) {
    if (typeof v !== "object" || v === null || Array.isArray(v)) fail(where, "expected an object");
    return v;
  }
  function keys(o, required, optional, where) {
    for (const k of Object.keys(o)) {
      if (!required.includes(k) && !optional.includes(k)) fail(`${where}.${k}`, "unknown field");
    }
    for (const k of required) if (!(k in o)) fail(`${where}.${k}`, "missing");
  }
  function str(v, where) {
    if (typeof v !== "string" || v.trim() === "") fail(where, "expected a non-empty string");
    return v;
  }
  function num(v, where) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) fail(where, "expected a number above 0");
    return v;
  }
  function bool(v, where) {
    if (typeof v !== "boolean") fail(where, "expected true or false");
  }
  function oneOf(v, values, where) {
    if (typeof v !== "string" || !values.includes(v)) fail(where, `expected one of ${values.join(", ")}`);
    return v;
  }
  function https(v, where) {
    if (!/^https:\/\/[^\s]+$/.test(str(v, where))) fail(where, "expected an https URL");
  }
  function isCalendarDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
  }
  function isoDate(v, where) {
    if (!isCalendarDate(str(v, where))) fail(where, "expected a real YYYY-MM-DD date");
  }
  function list(v, where) {
    if (!Array.isArray(v)) fail(where, "expected a list");
    return v;
  }
  function sha(v, where) {
    if (!/^[0-9a-f]{64}$/.test(str(v, where))) fail(where, "expected a sha256 hex digest");
  }
  var REQUIRED_QUESTIONS = ["label_alcohol", "device_condition", "battery_installed"];
  var KNOWN_FACTS = /* @__PURE__ */ new Set([
    "category",
    "tags",
    "evidence",
    "identity",
    "condition",
    "alcohol",
    "quantity",
    "battery.presence",
    "battery.chemistry",
    "battery.volts",
    "battery.milliampHours",
    "battery.whPrinted",
    "battery.whComputed",
    "battery.whStatus",
    "battery.wh",
    "battery.lithiumGrams",
    "battery.countAs",
    "battery.units",
    "battery.numbersFrom"
  ]);
  function checkPredicate(v, where, producible) {
    const p = obj(v, where);
    if ("all" in p || "any" in p) {
      const k = "all" in p ? "all" : "any";
      keys(p, [k], [], where);
      const items = list(p[k], `${where}.${k}`);
      if (items.length === 0) fail(`${where}.${k}`, "empty");
      items.forEach((x, i) => checkPredicate(x, `${where}.${k}[${i}]`, producible));
      return;
    }
    if ("not" in p) {
      keys(p, ["not"], [], where);
      checkPredicate(p.not, `${where}.not`, producible);
      return;
    }
    keys(p, ["fact", "op", "value"], [], where);
    if (!KNOWN_FACTS.has(str(p.fact, `${where}.fact`))) fail(`${where}.fact`, `no such fact: ${String(p.fact)}`);
    const op = oneOf(p.op, ["eq", "in", "has", "gt", "lte"], `${where}.op`);
    if (op === "in") list(p.value, `${where}.value`);
    if ((op === "gt" || op === "lte") && typeof p.value !== "number") fail(`${where}.value`, "expected a number");
    if (p.fact === "tags" && op === "has" && !producible.has(String(p.value))) {
      fail(`${where}.value`, `no category, label word or engine rule produces the tag ${String(p.value)}`);
    }
  }
  function checkDestination(code, v, questions, producible) {
    const where = `destinations.${code}`;
    const d = obj(v, where);
    keys(d, [
      "code",
      "name",
      "immUrl",
      "immEdition",
      "pageSha256",
      "reviewed",
      "checkedOn",
      "personReviewedOn",
      "noListFurnished",
      "lines",
      "customsChecked",
      "customsNotes"
    ], [], where);
    if (d.code !== code) fail(`${where}.code`, "must equal its key");
    str(d.name, `${where}.name`);
    https(d.immUrl, `${where}.immUrl`);
    isoDate(d.immEdition, `${where}.immEdition`);
    sha(d.pageSha256, `${where}.pageSha256`);
    bool(d.reviewed, `${where}.reviewed`);
    if (d.checkedOn !== null) isoDate(d.checkedOn, `${where}.checkedOn`);
    if (d.personReviewedOn !== null) isoDate(d.personReviewedOn, `${where}.personReviewedOn`);
    bool(d.noListFurnished, `${where}.noListFurnished`);
    bool(d.customsChecked, `${where}.customsChecked`);
    list(d.customsNotes, `${where}.customsNotes`).forEach((n, i) => str(n, `${where}.customsNotes[${i}]`));
    if (d.reviewed && !d.noListFurnished && list(d.lines, `${where}.lines`).length === 0) {
      fail(`${where}.lines`, "a reviewed listing needs its lines, or noListFurnished");
    }
    list(d.lines, `${where}.lines`).forEach((x, i) => {
      const lw = `${where}.lines[${i}]`;
      const line = obj(x, lw);
      keys(line, ["lineId", "section", "lineSha256", "ourWording", "matches"], ["noMatch"], lw);
      str(line.lineId, `${lw}.lineId`);
      oneOf(line.section, ["prohibitions", "restrictions", "observations"], `${lw}.section`);
      sha(line.lineSha256, `${lw}.lineSha256`);
      str(line.ourWording, `${lw}.ourWording`);
      const matches2 = list(line.matches, `${lw}.matches`);
      if (matches2.length === 0) {
        if (line.noMatch === void 0) fail(`${lw}.noMatch`, "a line with no matches needs a recorded decision");
        const nm = obj(line.noMatch, `${lw}.noMatch`);
        keys(nm, ["decision", "reason"], [], `${lw}.noMatch`);
        oneOf(
          nm.decision,
          ["not_a_gift_item", "exception_to_line", "cannot_judge_from_photo", "observation"],
          `${lw}.noMatch.decision`
        );
        str(nm.reason, `${lw}.noMatch.reason`);
      } else if (line.noMatch !== void 0) {
        fail(`${lw}.noMatch`, "a line that matches tags cannot also record no match");
      }
      matches2.forEach((y, j) => {
        const mw = `${lw}.matches[${j}]`;
        const m = obj(y, mw);
        keys(m, ["tag", "effect"], ["unlessAnswer"], mw);
        if (!producible.has(str(m.tag, `${mw}.tag`))) {
          fail(`${mw}.tag`, `no category, label word or engine rule produces the tag ${String(m.tag)}`);
        }
        oneOf(m.effect, ["take_out", "check"], `${mw}.effect`);
        if (m.unlessAnswer !== void 0) {
          const u = obj(m.unlessAnswer, `${mw}.unlessAnswer`);
          keys(u, ["questionId", "answerId"], [], `${mw}.unlessAnswer`);
          const answers = questions.get(str(u.questionId, `${mw}.unlessAnswer.questionId`));
          if (!answers) fail(`${mw}.unlessAnswer.questionId`, "not a known question");
          if (!answers?.has(str(u.answerId, `${mw}.unlessAnswer.answerId`))) {
            fail(`${mw}.unlessAnswer.answerId`, "not an answer that question offers");
          }
        }
      });
    });
  }
  function parseEdition(json) {
    const e = obj(json, "edition");
    keys(e, [
      "editionId",
      "service",
      "sources",
      "limits",
      "categoryTags",
      "labelWords",
      "questions",
      "rules",
      "destinations",
      "suspensions",
      "stopWords",
      "worksheetFields"
    ], ["revision"], "edition");
    str(e.editionId, "editionId");
    if (e.revision !== void 0 && !(typeof e.revision === "number" && Number.isInteger(e.revision) && e.revision >= 1)) {
      fail("revision", "must be a whole number from 1");
    }
    if (e.service !== "Priority Mail International") fail("service", "must be Priority Mail International");
    list(e.sources, "sources").forEach((x, i) => {
      const s2 = obj(x, `sources[${i}]`);
      keys(s2, ["id", "title", "edition", "url", "checkedOn"], [], `sources[${i}]`);
      oneOf(s2.id, ["usps_export", "suspensions", "stop_words_eu", "stop_words_uk"], `sources[${i}].id`);
      str(s2.title, `sources[${i}].title`);
      str(s2.edition, `sources[${i}].edition`);
      https(s2.url, `sources[${i}].url`);
      isoDate(s2.checkedOn, `sources[${i}].checkedOn`);
    });
    const l = obj(e.limits, "limits");
    keys(l, [
      "maxCells",
      "maxBatteries",
      "cellMaxWh",
      "batteryMaxWh",
      "cellMaxLithiumG",
      "batteryMaxLithiumG",
      "seriesVoltsThreshold",
      "whTolerancePct",
      "mixedOutcome",
      "unknownCountPolicy",
      "staleDays"
    ], [], "limits");
    for (const k of [
      "maxCells",
      "maxBatteries",
      "cellMaxWh",
      "batteryMaxWh",
      "cellMaxLithiumG",
      "batteryMaxLithiumG",
      "seriesVoltsThreshold",
      "whTolerancePct"
    ]) num(l[k], `limits.${k}`);
    if (l.whTolerancePct >= 3.8) fail("limits.whTolerancePct", "must stay below 3.8");
    oneOf(l.mixedOutcome, ["check", "take_out"], "limits.mixedOutcome");
    oneOf(l.unknownCountPolicy, ["ask", "assume_cell"], "limits.unknownCountPolicy");
    const sd = obj(l.staleDays, "limits.staleDays");
    keys(sd, ["usps_export", "destination", "suspensions", "customs"], [], "limits.staleDays");
    for (const k of Object.keys(sd)) num(sd[k], `limits.staleDays.${k}`);
    const ct = obj(e.categoryTags, "categoryTags");
    keys(ct, ITEM_CATEGORIES, [], "categoryTags");
    for (const c of ITEM_CATEGORIES) list(ct[c], `categoryTags.${c}`).forEach((t, i) => str(t, `categoryTags.${c}[${i}]`));
    list(e.labelWords, "labelWords").forEach((x, i) => {
      const w = obj(x, `labelWords[${i}]`);
      keys(w, ["pattern", "tag"], [], `labelWords[${i}]`);
      try {
        new RegExp(str(w.pattern, `labelWords[${i}].pattern`), "i");
      } catch {
        fail(`labelWords[${i}].pattern`, "not a valid pattern");
      }
      str(w.tag, `labelWords[${i}].tag`);
    });
    const producible = new Set(ENGINE_TAGS);
    for (const c of ITEM_CATEGORIES) for (const t of ct[c]) producible.add(t);
    for (const w of e.labelWords) producible.add(w.tag);
    const questions = /* @__PURE__ */ new Map();
    list(e.questions, "questions").forEach((x, i) => {
      const q = obj(x, `questions[${i}]`);
      keys(q, ["id", "text", "answers"], [], `questions[${i}]`);
      const id = str(q.id, `questions[${i}].id`);
      if (questions.has(id)) fail(`questions[${i}].id`, "duplicate");
      const answerIds = /* @__PURE__ */ new Set();
      questions.set(id, answerIds);
      str(q.text, `questions[${i}].text`);
      const answers = list(q.answers, `questions[${i}].answers`);
      if (answers.length < 2) fail(`questions[${i}].answers`, "needs at least two answers");
      answers.forEach((y, j) => {
        const a = obj(y, `questions[${i}].answers[${j}]`);
        keys(a, ["id", "label"], [], `questions[${i}].answers[${j}]`);
        answerIds.add(str(a.id, `questions[${i}].answers[${j}].id`));
        str(a.label, `questions[${i}].answers[${j}].label`);
      });
    });
    const ruleKeys = /* @__PURE__ */ new Set();
    list(e.rules, "rules").forEach((x, i) => {
      const w = `rules[${i}]`;
      const r = obj(x, w);
      keys(r, ["id", "layer", "scope", "section", "url", "basis", "ourWording", "when", "outcome"], ["askId"], w);
      const key = `${str(r.id, `${w}.id`)}|${typeof r.askId === "string" ? r.askId : ""}`;
      if (ruleKeys.has(key)) fail(`${w}.id`, "duplicate");
      ruleKeys.add(key);
      oneOf(r.layer, ["usps_export", "data"], `${w}.layer`);
      oneOf(r.scope, ["item", "box", "note"], `${w}.scope`);
      str(r.section, `${w}.section`);
      https(r.url, `${w}.url`);
      oneOf(r.basis, ["summarized", "inference", "estimate"], `${w}.basis`);
      str(r.ourWording, `${w}.ourWording`);
      checkPredicate(r.when, `${w}.when`, producible);
      oneOf(r.outcome, ["take_out", "check", "note"], `${w}.outcome`);
      if (r.askId !== void 0 && !questions.has(str(r.askId, `${w}.askId`))) fail(`${w}.askId`, "not a known question");
    });
    const blocks = (r) => r.scope === "item" && (r.outcome === "check" || r.outcome === "take_out");
    if (!e.rules.some((r) => r.layer === "usps_export" && blocks(r))) {
      fail("rules", "the edition has no USPS export item rule that can block a verdict");
    }
    for (const askId of REQUIRED_QUESTIONS) {
      if (!e.rules.some((r) => r.id === "DATA-NEEDS-ANSWER" && r.askId === askId && blocks(r))) {
        fail("rules", `the edition must ask ${askId} through a DATA-NEEDS-ANSWER item rule that can block a verdict`);
      }
    }
    const dests = obj(e.destinations, "destinations");
    for (const [code, d] of Object.entries(dests)) checkDestination(code, d, questions, producible);
    const s = obj(e.suspensions, "suspensions");
    keys(s, ["updated", "checkedOn", "url", "codes"], ["upcoming"], "suspensions");
    isoDate(s.updated, "suspensions.updated");
    isoDate(s.checkedOn, "suspensions.checkedOn");
    https(s.url, "suspensions.url");
    list(s.codes, "suspensions.codes").forEach((c, i) => {
      if (typeof c !== "string" || !/^[A-Z]{2}$/.test(c)) fail(`suspensions.codes[${i}]`, "expected a two-letter code");
    });
    const announced = /* @__PURE__ */ new Set();
    if (s.upcoming !== void 0) list(s.upcoming, "suspensions.upcoming").forEach((x, i) => {
      const u = obj(x, `suspensions.upcoming[${i}]`);
      keys(u, ["code", "from"], [], `suspensions.upcoming[${i}]`);
      if (typeof u.code !== "string" || !/^[A-Z]{2}$/.test(u.code)) fail(`suspensions.upcoming[${i}].code`, "expected a two-letter code");
      const code = u.code;
      if (announced.has(code)) fail(`suspensions.upcoming[${i}].code`, "listed twice");
      if (s.codes.includes(code)) fail(`suspensions.upcoming[${i}].code`, "already suspended");
      announced.add(code);
      isoDate(u.from, `suspensions.upcoming[${i}].from`);
    });
    list(e.stopWords, "stopWords").forEach((w, i) => str(w, `stopWords[${i}]`));
    list(e.worksheetFields, "worksheetFields").forEach((x, i) => {
      const f = obj(x, `worksheetFields[${i}]`);
      keys(f, ["id", "label", "kind", "source", "verified"], [], `worksheetFields[${i}]`);
      str(f.id, `worksheetFields[${i}].id`);
      str(f.label, `worksheetFields[${i}].label`);
      oneOf(f.kind, ["blank", "box", "item_column"], `worksheetFields[${i}].kind`);
      str(f.source, `worksheetFields[${i}].source`);
      bool(f.verified, `worksheetFields[${i}].verified`);
    });
    return structuredClone(json);
  }
  function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
      const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
  function resolveDestination(e, code, live, today) {
    const day = today !== void 0 && isCalendarDate(today) ? today : void 0;
    const ahead = day === void 0 ? void 0 : e.suspensions.upcoming?.find((u) => u.code === code);
    const started = ahead !== void 0 && day !== void 0 && day >= ahead.from;
    const suspended = e.suspensions.codes.includes(code) || started;
    const stored = e.destinations[code] ?? null;
    const edition2 = stored ?? live ?? null;
    let reviewState = "not_loaded";
    if (edition2) {
      if (edition2.noListFurnished) reviewState = "no_list_furnished";
      else if (stored && stored.reviewed) reviewState = "reviewed";
      else reviewState = "live_unreviewed";
    }
    return { code, name: edition2?.name ?? code, reviewState, suspended, ...ahead && !suspended ? { suspendsFrom: ahead.from } : {}, edition: edition2 };
  }

  // src/engine/destination.ts
  var SUSPENSIONS_URL = "https://about.usps.com/newsroom/service-alerts/international/";
  var COUNTRY_INDEX_URL = "https://pe.usps.com/text/imm/immctry.htm";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var longDate = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
  var SECTION_NAME = {
    prohibitions: "Prohibitions",
    restrictions: "Restrictions",
    observations: "Observations"
  };
  function evaluateDestination(facts, answers, dest) {
    const hits = [];
    const url = dest.edition?.immUrl ?? COUNTRY_INDEX_URL;
    if (dest.suspended) {
      hits.push({
        ruleId: "DEST-SUSPENDED",
        layer: "destination",
        level: "check",
        section: "USPS international service alerts",
        url: SUSPENSIONS_URL,
        text: `Mail to ${dest.name} is suspended right now. Nothing in this box can go until service returns.`
      });
    }
    if (!dest.suspended && dest.suspendsFrom) {
      hits.push({
        ruleId: "DEST-SUSPENSION-AHEAD",
        layer: "destination",
        level: "note",
        section: "USPS international service alerts",
        url: SUSPENSIONS_URL,
        text: `The post office stops taking mail to ${dest.name} on ${longDate(dest.suspendsFrom)}. Mail this box before then.`
      });
    }
    if (dest.reviewState === "not_loaded" || dest.reviewState === "live_unreviewed") {
      hits.push({
        ruleId: "DATA-DEST-UNREVIEWED",
        layer: "data",
        level: "check",
        section: "IMM country listing",
        url,
        text: "We have not reviewed this country. Read its listing before you pack."
      });
    }
    if (dest.reviewState === "no_list_furnished") {
      hits.push({
        ruleId: "DATA-DEST-NO-LIST",
        layer: "data",
        level: "check",
        section: "IMM country listing",
        url,
        text: "This country's listing gives no list. That does not mean everything is allowed."
      });
    }
    for (const line of dest.edition?.lines ?? []) {
      let level = null;
      for (const m of line.matches) {
        if (!facts.tags.includes(m.tag)) continue;
        if (m.unlessAnswer && answers[m.unlessAnswer.questionId] === m.unlessAnswer.answerId) continue;
        if (m.effect === "take_out" || level === null) level = m.effect;
      }
      if (level) {
        hits.push({
          ruleId: line.lineId,
          layer: "destination",
          level,
          text: line.ourWording,
          section: `IMM ${dest.name}, ${SECTION_NAME[line.section]}`,
          url
        });
      }
    }
    return hits;
  }

  // src/engine/types.ts
  var DISPUTE_FIELDS = [
    "category",
    "retailBox",
    "battery",
    "lithiumGrams",
    "batteryWords",
    "liquid",
    "pressurized",
    "alcoholOnLabel",
    "flammableOnLabel",
    "glassContainer",
    "powder",
    "labelTags",
    "evidence"
  ];
  function openDisputes(disputes) {
    return DISPUTE_FIELDS.filter((f) => disputes?.[f] !== void 0 && disputes[f].resolved !== true);
  }

  // src/engine/predicates.ts
  function factAt(facts, path) {
    let value = facts;
    for (const key of path.split(".")) {
      if (value === null || typeof value !== "object" || !(key in value)) return void 0;
      value = value[key];
    }
    return value;
  }
  function matches(pred, facts) {
    if ("all" in pred) return pred.all.every((p) => matches(p, facts));
    if ("any" in pred) return pred.any.some((p) => matches(p, facts));
    if ("not" in pred) return !matches(pred.not, facts);
    const v = factAt(facts, pred.fact);
    if (v === void 0 || v === null) return false;
    switch (pred.op) {
      case "eq":
        return v === pred.value;
      case "in":
        return Array.isArray(pred.value) && pred.value.includes(v);
      case "has":
        return Array.isArray(v) && v.includes(pred.value);
      case "gt":
        return typeof v === "number" && typeof pred.value === "number" && v > pred.value;
      case "lte":
        return typeof v === "number" && typeof pred.value === "number" && v <= pred.value;
    }
  }

  // src/engine/itemRules.ts
  function evaluateItemRules(facts, rules) {
    const hits = [];
    for (const r of rules) {
      if (r.scope !== "item" || !matches(r.when, facts)) continue;
      const hit = { ruleId: r.id, layer: r.layer, level: r.outcome, text: r.ourWording, section: r.section, url: r.url };
      if (r.askId) hit.askId = r.askId;
      hits.push(hit);
    }
    return hits;
  }

  // src/engine/layers.ts
  var DAY_MS = 864e5;
  function ageInDays(checkedOn, today) {
    if (!isCalendarDate(checkedOn) || !isCalendarDate(today)) return null;
    return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${checkedOn}T00:00:00Z`)) / DAY_MS);
  }
  function layer(id, label, edition2, checkedOn, present, staleDays, today) {
    let state = "missing";
    const age = present && checkedOn ? ageInDays(checkedOn, today) : null;
    if (age !== null && age >= 0) state = age > staleDays ? "stale" : "checked";
    return { id, label, edition: edition2, checkedOn, state };
  }
  function rulesReadBy(dest) {
    const d = dest.edition;
    if (dest.reviewState !== "reviewed" || d === null) return null;
    if (d.personReviewedOn) return { by: "person", on: d.personReviewedOn };
    return d.checkedOn ? { by: "usps_page", on: d.checkedOn } : null;
  }
  function layerStatuses(edition2, dest, today) {
    const stale = edition2.limits.staleDays;
    const usps = edition2.sources.find((s) => s.id === "usps_export");
    const d = dest.edition;
    const reviewed = dest.reviewState === "reviewed" && d !== null;
    const immEdition = d ? `IMM ${d.immEdition}` : "not loaded";
    const readBy = rulesReadBy(dest);
    let destLabel = `${dest.name} rules`;
    if (readBy?.by === "person") destLabel += `: checked by a person on ${readBy.on}`;
    else if (readBy?.by === "usps_page") destLabel += `: read from the USPS page on ${readBy.on}; not yet checked by a person`;
    return [
      layer("usps_export", "USPS export rules", usps?.edition ?? "not loaded", usps?.checkedOn ?? null, Boolean(usps), stale.usps_export, today),
      layer("destination", destLabel, immEdition, d?.checkedOn ?? null, reviewed, stale.destination, today),
      layer(
        "suspensions",
        "Service suspensions",
        `Updated ${edition2.suspensions.updated}`,
        edition2.suspensions.checkedOn,
        true,
        stale.suspensions,
        today
      ),
      layer("customs", `${dest.name} customs`, immEdition, d?.checkedOn ?? null, reviewed && Boolean(d?.customsChecked), stale.customs, today)
    ];
  }

  // src/engine/lithiumBox.ts
  var TWO_BOX_NOTE = "No more than 2 boxes with lithium batteries can go to one address in one mailing.";
  var plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function evaluateLithiumBox(entries, limits) {
    const counted = entries.filter((e) => e.battery.presence === "installed");
    const sortedIds = (list2) => [...new Set(list2.map((e) => e.itemId))].sort();
    if (counted.length === 0) {
      return { status: "none", cells: { min: 0, max: 0 }, batteries: { min: 0, max: 0 }, itemIds: [], unknownItemIds: [], text: "" };
    }
    const assumeCell = limits.unknownCountPolicy === "assume_cell";
    let knownCells = 0;
    let knownBatteries = 0;
    const unknown = [];
    for (const e of counted) {
      const kind = e.battery.countAs === "unknown" && assumeCell ? "cell" : e.battery.countAs;
      if (kind === "cell") knownCells += e.battery.units;
      else if (kind === "battery") knownBatteries += e.battery.units;
      else unknown.push(e);
    }
    const unknownUnits = unknown.reduce((n, e) => n + e.battery.units, 0);
    const total = knownCells + knownBatteries + unknownUnits;
    let sums = /* @__PURE__ */ new Set([0, unknownUnits]);
    if (total <= limits.maxCells + limits.maxBatteries) {
      sums = /* @__PURE__ */ new Set([0]);
      for (const e of unknown) sums = new Set([...sums].flatMap((s) => [s, s + e.battery.units]));
    }
    const outcomes = [...sums].map((s) => {
      const cells2 = knownCells + s;
      const batteries2 = knownBatteries + unknownUnits - s;
      const ok = batteries2 === 0 && cells2 <= limits.maxCells || cells2 === 0 && batteries2 <= limits.maxBatteries;
      const over = cells2 > limits.maxCells || batteries2 > limits.maxBatteries;
      const kind = ok ? "ok" : over ? "over" : "mixed";
      return { cells: cells2, batteries: batteries2, kind };
    });
    const okCount = outcomes.filter((o) => o.kind === "ok").length;
    const status = okCount === outcomes.length ? "ok" : okCount > 0 ? "depends" : outcomes.every((o) => o.kind === "over") ? "over" : "mixed";
    const cellCounts = outcomes.map((o) => o.cells);
    const batteryCounts = outcomes.map((o) => o.batteries);
    const cells = { min: Math.min(...cellCounts), max: Math.max(...cellCounts) };
    const batteries = { min: Math.min(...batteryCounts), max: Math.max(...batteryCounts) };
    const rule = `${limits.maxCells} cells or ${limits.maxBatteries} batteries, not both`;
    let text;
    if (status === "ok") {
      text = `Lithium batteries in this box are within the limit: ${rule}.`;
    } else if (status === "over") {
      if (batteries.max === 0) text = `${plural(cells.max, "cell", "cells")} in this box. The limit is ${limits.maxCells}. ${TWO_BOX_NOTE}`;
      else if (cells.max === 0) {
        text = `${plural(batteries.max, "battery", "batteries")} in this box. The limit is ${limits.maxBatteries}. ${TWO_BOX_NOTE}`;
      } else if (unknownUnits === 0) {
        text = `${plural(batteries.max, "battery", "batteries")} and ${plural(cells.max, "cell", "cells")} in this box. The limit is ${rule}. ${TWO_BOX_NOTE}`;
      } else text = `Too many lithium batteries in this box. The limit is ${rule}. ${TWO_BOX_NOTE}`;
    } else if (status === "mixed") {
      text = `This box has both a battery and a cell. A box can hold ${rule}. ${TWO_BOX_NOTE}`;
    } else {
      text = `The answer depends on how many cells each battery has. A box can hold ${rule}. ${TWO_BOX_NOTE}`;
    }
    return { status, cells, batteries, itemIds: sortedIds(counted), unknownItemIds: sortedIds(unknown), text };
  }

  // src/engine/verdict.ts
  var HEADLINE = { ok: "OK to pack", check: "Check this", take_out: "Take it out" };
  var SEVERITY = { take_out: 2, check: 1, note: 0 };
  var RULES_PAGE = "https://before-you-tape-2026.web.app/rules";
  var PUB52_LITHIUM = "https://pe.usps.com/text/pub52/pub52c6_005.htm";
  var IDENTITY_HIT = {
    ruleId: "DATA-IDENTITY",
    layer: "data",
    level: "check",
    section: "Before You Tape: identity check",
    url: RULES_PAGE,
    text: "Confirm what this is. We only saw it, so we can't be sure from the picture alone."
  };
  var UNSURE_HIT = {
    ruleId: "DATA-UNSURE",
    layer: "data",
    level: "check",
    section: "Before You Tape: reading check",
    url: RULES_PAGE,
    text: "We're not sure what this is. Fix the reading or type what it is."
  };
  var DISPUTE_HIT = {
    ruleId: "DATA-DISPUTE",
    layer: "data",
    level: "check",
    section: "Before You Tape: two reads disagree",
    url: RULES_PAGE,
    text: "The two reads of this item disagree. Choose the reading that matches it."
  };
  var shown = (n) => String(Math.round(n * 100) / 100);
  function labelNumbersHit(m) {
    const said = m.kind === "wh" ? `${shown(m.label)} Wh but the read says ${shown(m.read)} Wh` : `${shown(m.label)} g of lithium but the read says ${shown(m.read)} g`;
    return {
      ruleId: "DATA-LABEL-NUMBERS",
      layer: "data",
      level: "check",
      section: "Before You Tape: label and reading disagree",
      url: RULES_PAGE,
      text: `The label text says ${said}. Type the numbers from the label in Fix this reading.`
    };
  }
  var BAD_QUANTITY_HIT = {
    ruleId: "DATA-BAD-QUANTITY",
    layer: "data",
    level: "check",
    section: "Before You Tape: item count",
    url: RULES_PAGE,
    text: "The count for this item must be a whole number, 1 or more. Fix the count."
  };
  function boxHit(edition2, ruleId, level, text, askId) {
    const rule = edition2.rules.find((r) => r.id === ruleId);
    const hit = {
      ruleId,
      layer: "box",
      level,
      text: text ?? rule?.ourWording ?? ruleId,
      section: rule?.section ?? "Pub 52 622.5",
      url: rule?.url ?? PUB52_LITHIUM
    };
    if (askId) hit.askId = askId;
    return hit;
  }
  function evaluateBox(items, edition2, dest, today, settle = true) {
    const sorted = [...items].sort((a, b) => a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0);
    const layers = layerStatuses(edition2, dest, today);
    const notChecked = layers.filter((l) => l.state !== "checked");
    const layerHit = notChecked.length ? {
      ruleId: "DATA-LAYER-STALE",
      layer: "data",
      level: "check",
      section: "Before You Tape: rule layers",
      url: RULES_PAGE,
      text: `Not checked or out of date: ${notChecked.map((l) => l.label).join(", ")}.`
    } : null;
    const perItem = sorted.map((raw) => {
      const goodQuantity = Number.isInteger(raw.quantity) && raw.quantity >= 1;
      const input = goodQuantity ? raw : { ...raw, quantity: 1 };
      const facts = deriveFacts(input, edition2);
      const hits = [];
      if (!goodQuantity) hits.push(BAD_QUANTITY_HIT);
      if (openDisputes(raw.disputes).length > 0) hits.push(DISPUTE_HIT);
      if (facts.identity === "unconfirmed") hits.push(IDENTITY_HIT);
      if (facts.evidence === "not_sure" || facts.category === "other") hits.push(UNSURE_HIT);
      if (facts.battery.labelMismatch) hits.push(labelNumbersHit(facts.battery.labelMismatch));
      hits.push(...evaluateItemRules(facts, edition2.rules));
      hits.push(...evaluateDestination(facts, input.answers, dest));
      if (layerHit) hits.push(layerHit);
      return { itemId: input.itemId, facts, hits };
    });
    const lithium = evaluateLithiumBox(
      perItem.filter((p) => !p.hits.some((h) => h.level === "take_out")).map((p) => ({ itemId: p.itemId, battery: p.facts.battery })),
      edition2.limits
    );
    const counted = new Set(lithium.itemIds);
    const unknown = new Set(lithium.unknownItemIds);
    for (const p of perItem) {
      if (!counted.has(p.itemId)) continue;
      if (lithium.status === "over") p.hits.push(boxHit(edition2, "USPS-INTL-LI-BOX-COUNT", "take_out", lithium.text));
      else if (lithium.status === "mixed") p.hits.push(boxHit(edition2, "USPS-INTL-LI-BOX-MIXED", edition2.limits.mixedOutcome, lithium.text));
      else if (lithium.status === "depends") {
        p.hits.push(boxHit(edition2, "USPS-INTL-LI-BOX-COUNT", "check", lithium.text, unknown.has(p.itemId) ? "cell_count" : void 0));
      }
    }
    const notes = lithium.status === "none" ? [] : [
      boxHit(edition2, "USPS-INTL-LI-NO-MARKING", "note"),
      boxHit(edition2, "USPS-INTL-LI-TWO-BOXES", "note")
    ];
    const result = {};
    const counts = { ok: 0, check: 0, takeOut: 0 };
    for (const p of perItem) {
      const hits = [...p.hits].sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level]);
      const top = hits[0];
      const level = top && top.level !== "note" ? top.level : "ok";
      const askId = hits.find((h) => h.askId)?.askId;
      const question = askId ? edition2.questions.find((q) => q.id === askId) ?? null : null;
      result[p.itemId] = { level, headline: HEADLINE[level], hits, question, layers, service: edition2.service };
      if (level === "ok") counts.ok++;
      else if (level === "check") counts.check++;
      else counts.takeOut++;
    }
    if (settle) {
      for (const p of perItem) settleQuestion(p.itemId, p.facts.battery.presence, items, result, edition2, dest, today);
    }
    return { items: result, lithium, destination: dest, notes, counts, editionId: edition2.editionId };
  }
  function settleQuestion(itemId, presence, items, result, edition2, dest, today) {
    const v = result[itemId];
    const q = v?.question;
    if (!v || !q || v.level !== "take_out" || q.answers.length === 0) return;
    if (!v.hits.some((h) => h.level === "take_out" && h.askId !== q.id)) return;
    const alone = presence === "none" && q.id !== "battery_installed";
    const pool = alone ? items.filter((i) => i.itemId === itemId) : items;
    const unchanged = q.answers.every((a) => {
      const answered = pool.map((i) => i.itemId === itemId ? { ...i, answers: { ...i.answers, [q.id]: a.id } } : i);
      const r = evaluateBox(answered, edition2, dest, today, false);
      return pool.every((i) => r.items[i.itemId]?.level === (i.itemId === itemId ? "take_out" : result[i.itemId]?.level));
    });
    if (unchanged) result[itemId] = { ...v, hits: v.hits.filter((h) => h.askId !== q.id), question: null };
  }

  // src/shared/noItem.ts
  var NO_NAME = /^(?:an? )?(?:unknown|unidentified|unclear|none|nothing|no item|no object|empty|n\/?a|not sure)(?: (?:item|object|thing))?\.?$/i;
  function isNoItem(r) {
    const signal = r.batteryWords || r.liquid || r.pressurized || r.alcoholOnLabel || r.flammableOnLabel || r.glassContainer || r.powder || r.volts > 0 || r.milliampHours > 0 || r.wattHours > 0 || r.lithiumGrams > 0;
    const name = r.itemName.trim();
    return r.category === "other" && r.evidence === "not_sure" && r.labelText.trim() === "" && !signal && (name === "" || NO_NAME.test(name));
  }

  // src/shared/secondLook.ts
  var SECOND_LOOK_DEFAULT = { whMismatch: true, batteryNumbers: true, notSure: true, hazardNoLabel: true, identity: true };
  var HAZARD_TAGS = ["flammable", "pressurized", "alcohol", "lighter", "vaping", "fragrance"];
  function needsSecondLook(facts, outcome, policy) {
    if (outcome.source !== "on_device") return null;
    const b = facts.battery;
    if (policy.whMismatch && b.whStatus === "printed_mismatch") return "wh_mismatch";
    if (policy.batteryNumbers && b.presence !== "none") return "battery_numbers";
    if (policy.notSure && facts.evidence === "not_sure") return "not_sure";
    if (policy.hazardNoLabel && facts.identity !== "label" && facts.tags.some((t) => HAZARD_TAGS.includes(t))) return "hazard_no_label";
    if (policy.identity && facts.identity === "unconfirmed") return "identity";
    return null;
  }
  var HAZARD_FLAGS = ["batteryWords", "liquid", "pressurized", "alcoholOnLabel", "flammableOnLabel", "glassContainer", "powder"];
  var WH_FIELDS = ["volts", "milliampHours", "wattHours"];
  var whOf = (r) => r.wattHours > 0 ? r.wattHours : r.volts * r.milliampHours / 1e3;
  var batteryOf = (r) => ({ volts: r.volts, milliampHours: r.milliampHours, wattHours: r.wattHours });
  var EVIDENCE_RANK = { not_sure: 0, item_seen: 1, label_read: 2 };
  function mergeReads(device, cloud) {
    const merged = {
      ...cloud,
      // The longer label is the one shown; the store keeps both labels' tags, so a word only the shorter had
      // still counts.
      labelText: device.labelText.length > cloud.labelText.length ? device.labelText : cloud.labelText,
      ...batteryOf(whOf(device) > whOf(cloud) ? device : cloud),
      lithiumGrams: Math.max(device.lithiumGrams, cloud.lithiumGrams),
      retailBox: device.retailBox === cloud.retailBox ? cloud.retailBox : device.retailBox === "open_or_none" || cloud.retailBox === "open_or_none" ? "open_or_none" : "cannot_tell",
      evidence: EVIDENCE_RANK[device.evidence] < EVIDENCE_RANK[cloud.evidence] ? device.evidence : cloud.evidence
    };
    for (const flag of HAZARD_FLAGS) merged[flag] = device[flag] || cloud[flag];
    return merged;
  }
  function readDisputes(device, cloud) {
    const d = {};
    if (device.category !== cloud.category) d.category = { device: device.category, cloud: cloud.category, resolved: false };
    if (device.retailBox !== cloud.retailBox) d.retailBox = { device: device.retailBox, cloud: cloud.retailBox, resolved: false };
    if (WH_FIELDS.some((f) => device[f] !== cloud[f])) d.battery = { device: batteryOf(device), cloud: batteryOf(cloud), resolved: false };
    if (device.lithiumGrams !== cloud.lithiumGrams) d.lithiumGrams = { device: device.lithiumGrams, cloud: cloud.lithiumGrams, resolved: false };
    for (const flag of HAZARD_FLAGS) if (device[flag] !== cloud[flag]) d[flag] = { device: device[flag], cloud: cloud[flag], resolved: false };
    if (device.evidence !== cloud.evidence) d.evidence = { device: device.evidence, cloud: cloud.evidence, resolved: false };
    return d;
  }

  // src/embed/bridge.ts
  function clonePlainData(value) {
    if (value === null || typeof value !== "object") {
      if (typeof value === "function" || typeof value === "symbol") throw new TypeError("cannot clone a function or a symbol");
      return value;
    }
    if (Array.isArray(value)) return value.map(clonePlainData);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError("this structuredClone copies plain data only");
    const out = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(out, key, {
        value: clonePlainData(value[key]),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return out;
  }
  var g = globalThis;
  if (typeof g.structuredClone !== "function") {
    g.structuredClone = (value) => clonePlainData(value);
  }
  var BRIDGE_VERSION = 1;
  var NoEditionError = class extends Error {
    constructor() {
      super(...arguments);
      __publicField(this, "name", "NoEditionError");
    }
  };
  var BadInputError = class extends Error {
    constructor() {
      super(...arguments);
      __publicField(this, "name", "BadInputError");
    }
  };
  var edition = null;
  function reply(work) {
    try {
      return JSON.stringify({ ok: true, value: work() });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return JSON.stringify({ ok: false, error: { name: err.name, message: err.message } });
    }
  }
  function current() {
    if (!edition) throw new NoEditionError("no rule edition is loaded; call setEdition first");
    return edition;
  }
  function object(text) {
    const data = JSON.parse(text);
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new BadInputError("the input is not a JSON object");
    return data;
  }
  function plain(v, where) {
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BadInputError(`${where} must be an object`);
    return v;
  }
  function checkField2(f, v, where, typedText = false) {
    const ok = f.kind === "string" ? typeof v === "string" : f.kind === "number" ? typeof v === "number" && Number.isFinite(v) && v >= 0 || typedText && typeof v === "string" : f.kind === "boolean" ? typeof v === "boolean" : typeof v === "string" && (f.values ?? []).includes(v);
    if (!ok) throw new BadInputError(`${where}.${f.name} is not a valid ${f.kind}`);
  }
  var FIELDS = new Map(ITEM_READ_FIELDS.map((f) => [f.name, f]));
  var IDENTITY_SOURCES = /* @__PURE__ */ new Set(["sender", "second_look"]);
  function checkRead(raw, where) {
    const read = plain(raw, where);
    for (const f of ITEM_READ_FIELDS) checkField2(f, read[f.name], where);
    if (Array.from(read.labelText).length > LABEL_TEXT_MAX) {
      throw new BadInputError(`${where}.labelText is longer than ${LABEL_TEXT_MAX} characters`);
    }
    return read;
  }
  var POLICY_KEYS = ["whMismatch", "batteryNumbers", "notSure", "hazardNoLabel", "identity"];
  function checkPolicy(raw) {
    const o = plain(raw, "policy");
    for (const k of Object.keys(o)) if (!POLICY_KEYS.includes(k)) throw new BadInputError(`policy.${k} is not a second-look reason`);
    for (const k of POLICY_KEYS) if (typeof o[k] !== "boolean") throw new BadInputError(`policy.${k} must be true or false`);
    return o;
  }
  function checkItems(raw) {
    if (!Array.isArray(raw)) throw new BadInputError("items must be an array");
    const ids = /* @__PURE__ */ new Set();
    raw.forEach((entry, i) => {
      const o = plain(entry, `items[${i}]`);
      const id = o.itemId;
      if (typeof id !== "string" || id === "" || id in Object.prototype) throw new BadInputError(`items[${i}].itemId is not a usable id`);
      if (ids.has(id)) throw new BadInputError(`item id ${id} appears twice`);
      ids.add(id);
      checkRead(o.read, `${id}.read`);
      for (const [k, v] of Object.entries(plain(o.overrides, `${id}.overrides`))) {
        const f = FIELDS.get(k);
        if (!f) throw new BadInputError(`${id}.overrides.${k} is not an item-read field`);
        checkField2(f, v, `${id}.overrides`, true);
      }
      for (const [k, v] of Object.entries(plain(o.answers, `${id}.answers`))) {
        if (typeof v !== "string") throw new BadInputError(`${id}.answers.${k} must be a string`);
      }
      if (typeof o.quantity !== "number" || !Number.isFinite(o.quantity)) throw new BadInputError(`${id}.quantity must be a finite number`);
      const by = o.identityConfirmedBy;
      if (by !== null && !(typeof by === "string" && IDENTITY_SOURCES.has(by))) {
        throw new BadInputError(`${id}.identityConfirmedBy must be "sender", "second_look" or null`);
      }
      if (!Array.isArray(o.labelTags) || !o.labelTags.every((t) => typeof t === "string")) {
        throw new BadInputError(`${id}.labelTags must be a list of strings`);
      }
      if (o.labelFigures !== void 0) {
        const f = plain(o.labelFigures, `${id}.labelFigures`);
        const keys2 = Object.keys(f).sort().join(",");
        if (keys2 !== "grams,wh") throw new BadInputError(`${id}.labelFigures must have exactly wh and grams`);
        for (const k of ["wh", "grams"]) {
          const list2 = f[k];
          if (!Array.isArray(list2) || list2.length > 8 || !list2.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) {
            throw new BadInputError(`${id}.labelFigures.${k} must be up to 8 numbers above 0`);
          }
        }
      }
      if (o.numbersFrom !== void 0 && o.numbersFrom !== "typed" && o.numbersFrom !== "read") {
        throw new BadInputError(`${id}.numbersFrom must be "typed", "read" or left out`);
      }
      if (o.disputes !== void 0) {
        for (const [k, v] of Object.entries(plain(o.disputes, `${id}.disputes`))) {
          if (!DISPUTE_FIELDS.includes(k)) throw new BadInputError(`${id}.disputes.${k} is not a fact two reads can dispute`);
          if (typeof plain(v, `${id}.disputes.${k}`).resolved !== "boolean") throw new BadInputError(`${id}.disputes.${k}.resolved must be true or false`);
        }
      }
    });
    return raw;
  }
  function str2(o, key) {
    const v = o[key];
    if (typeof v !== "string") throw new BadInputError(`${key} must be a string`);
    return v;
  }
  function setEdition(editionJson) {
    return reply(() => {
      const parsed = parseEdition(JSON.parse(editionJson));
      edition = parsed;
      const destinations = Object.entries(parsed.destinations).map(([code, d]) => ({ code, name: d.name })).sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
      return { editionId: parsed.editionId, destinations };
    });
  }
  function canonicalEdition() {
    return reply(() => canonicalJson(current()));
  }
  function editionBodyCanonical() {
    return reply(() => {
      const body = { ...current() };
      delete body.editionId;
      return canonicalJson(body);
    });
  }
  function evaluateBoxJson(inputJson) {
    return reply(() => {
      const e = current();
      const input = object(inputJson);
      const items = checkItems(input.items);
      const live = input.live === void 0 ? void 0 : plain(input.live, "live");
      const today = str2(input, "today");
      return evaluateBox(items, e, resolveDestination(e, str2(input, "code"), live, today), today);
    });
  }
  function destinationHitsJson(inputJson) {
    return reply(() => {
      const e = current();
      const input = object(inputJson);
      const facts = plain(input.facts, "facts");
      if (!Array.isArray(facts.tags) || !facts.tags.every((t) => typeof t === "string")) throw new BadInputError("facts.tags must be a list of strings");
      checkField2(FIELDS.get("category"), facts.category, "facts");
      const answers = plain(input.answers ?? {}, "answers");
      for (const [k, v] of Object.entries(answers)) {
        if (typeof v !== "string") throw new BadInputError(`answers.${k} must be a string`);
      }
      return evaluateDestination(facts, answers, resolveDestination(e, str2(input, "code")));
    });
  }
  function labelTagsJson(labelText) {
    return reply(() => labelTagsOf(labelText, current()));
  }
  function parseItemReadJson(text) {
    return reply(() => parseItemRead(text));
  }
  function parseItemReadTaggedJson(text) {
    return reply(() => {
      const { read, fullLabelText } = parseItemReadWithLabel(text);
      return { read, labelTags: labelTagsOf(fullLabelText, current()) };
    });
  }
  function isNoItemJson(readJson) {
    return reply(() => isNoItem(parseItemRead(readJson)));
  }
  function secondLookReasonJson(inputJson) {
    return reply(() => {
      const input = object(inputJson);
      const [item] = checkItems([input.item]);
      const policy = input.policy === void 0 ? SECOND_LOOK_DEFAULT : checkPolicy(input.policy);
      return { reason: needsSecondLook(deriveFacts(item, current()), { source: str2(input, "source") }, policy) };
    });
  }
  function mergeSecondLookJson(inputJson) {
    return reply(() => {
      const input = object(inputJson);
      const device = checkRead(input.device, "device");
      const cloud = checkRead(input.cloud, "cloud");
      return { merged: mergeReads(device, cloud), disputes: readDisputes(device, cloud), sameCategory: device.category === cloud.category };
    });
  }
  function itemReadContract() {
    return reply(() => ({ fields: ITEM_READ_FIELDS, schema: itemReadJsonSchema(), labelTextMax: LABEL_TEXT_MAX }));
  }
  return __toCommonJS(bridge_exports);
})();
