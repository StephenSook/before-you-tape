// Test fixture, not app code: every brand, maker or model the eval photos' own descriptions name. The measured
// set keeps its descriptions; /judge shows none of these names.
export const BRANDS = ["eos", "shea better", "Sally Hansen", "OPI", "Walgreens", "Palmer", "Shams", "Bellavita", "Honey Oud", "Burberry",
  "Rancho La Gloria", "Malibu", "818", "Pineng", "PN-963", "Voltcraft", "PB-16", "JETech", "Varta", "Blackview", "A60", "Lost Vape",
  "Ursa", "Hardcast", "Axe", "BIC", "Bronner", "Hanes", "Beefy", "Bjorn Borg", "Converse", "Jack Purcell", "AIP", "Norcom", "Polo",
  "Ralph Lauren", "Motorola", "G62", "Lindt", "Excellence", "Bellarom", "Forest Feast", "Preda"];

// Whole words only, so "Arabica" is not the lighter brand.
export const brandWord = (b: string): RegExp => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
