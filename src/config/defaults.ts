import { SECOND_LOOK_DEFAULT } from "../routing/policy";
import type { HolidayDate } from "./holidayDates";

// In-app defaults for the Remote Config keys (spec 5.10). Remote Config overrides them once it loads;
// until then, and offline, these are the values the app runs with.
export const CONFIG_DEFAULTS = {
  // cloud_model_item: the cloud model for item reads.
  cloudModelItem: "gemini-3.5-flash-lite",
  // cloud_model_item_fallback: tried once when the item model still answers 500 or 503 after its retry;
  // an empty value turns it off.
  cloudModelItemFallback: "gemini-3.8-flash",
  // cloud_model_text: a cloud model for text-only reads, kept in Remote Config; no web code reads it today.
  cloudModelText: "gemini-3.5-flash-lite",
  // kill_cloud: pause every cloud call; checks on the device still work.
  killCloud: false,
  // second_look_policy_json: which on-device reads get a cloud second look.
  secondLook: SECOND_LOOK_DEFAULT,
  // rules_edition_id and rules_edition_sha256: a newer published rule edition; empty uses the built-in one.
  rulesEditionId: "",
  rulesEditionSha256: "",
  // holiday_dates_json: the USPS holiday mailing dates, read from usps.com; empty shows none. Read 2026-11-21 from the
  // page's international table, "Recommended send-by dates for expected delivery before December 25": Priority Mail
  // International, Wednesday, Dec. 9, the same for all nine destination regions it lists.
  holidayDates: [
    { service: "Priority Mail International", sendBy: "2026-12-09", deliverBy: "2026-12-25", sourceUrl: "https://www.usps.com/holiday/holiday-shipping-dates.htm", checkedOn: "2026-11-21" },
  ] as HolidayDate[],
};
