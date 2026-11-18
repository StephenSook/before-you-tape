// A read of no item: the model was unsure, saw nothing it could name, read no label and noticed no
// battery, liquid or warning. A camera pointed at a room gives this; it is dropped, never added as a card.
import type { ItemRead } from "./itemRead";

const NO_NAME = /^(?:an? )?(?:unknown|unidentified|unclear|none|nothing|no item|no object|empty|n\/?a|not sure)(?: (?:item|object|thing))?\.?$/i;

export function isNoItem(r: ItemRead): boolean {
  const signal = r.batteryWords || r.liquid || r.pressurized || r.alcoholOnLabel || r.flammableOnLabel || r.glassContainer || r.powder
    || r.volts > 0 || r.milliampHours > 0 || r.wattHours > 0 || r.lithiumGrams > 0;
  const name = r.itemName.trim();
  return r.category === "other" && r.evidence === "not_sure" && r.labelText.trim() === "" && !signal && (name === "" || NO_NAME.test(name));
}
