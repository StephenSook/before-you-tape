import BYTCore
import Foundation
import FoundationModels

/// What the on-device model fills from one item: the web app's read (src/shared/itemRead.ts),
/// field for field. No pattern guides: Gemini refuses regex guides, and both models use this type.
@Generable
struct ItemReadG {
    @Generable
    enum CategoryG: String, CaseIterable {
        case perfumeFragrance = "perfume_fragrance"
        case nailPolish = "nail_polish"
        case aerosolSpray = "aerosol_spray"
        case handSanitizer = "hand_sanitizer"
        case lotionCream = "lotion_cream"
        case liquidToiletry = "liquid_toiletry"
        case makeup = "makeup"
        case powder = "powder"
        case medicine = "medicine"
        case alcoholDrink = "alcohol_drink"
        case foodPackaged = "food_packaged"
        case chocolate = "chocolate"
        case coffee = "coffee"
        case cookingOil = "cooking_oil"
        case meatProduct = "meat_product"
        case phone = "phone"
        case tablet = "tablet"
        case laptop = "laptop"
        case smartwatch = "smartwatch"
        case earbuds = "earbuds"
        case powerBank = "power_bank"
        case looseBattery = "loose_battery"
        case batteryToy = "battery_toy"
        case musicalCard = "musical_card"
        case otherElectronics = "other_electronics"
        case lighterMatches = "lighter_matches"
        case eCigarette = "e_cigarette"
        case gluePaint = "glue_paint"
        case knifeTool = "knife_tool"
        case toyGun = "toy_gun"
        case candle = "candle"
        case jewelryWatch = "jewelry_watch"
        case clothing = "clothing"
        case shoes = "shoes"
        case bookPaper = "book_paper"
        case toy = "toy"
        case other = "other"
    }

    @Generable
    enum RetailBoxG: String, CaseIterable {
        case sealed
        case openOrNone = "open_or_none"
        case cannotTell = "cannot_tell"
    }

    @Generable
    enum EvidenceG: String, CaseIterable {
        case labelRead = "label_read"
        case itemSeen = "item_seen"
        case notSure = "not_sure"
    }

    @Guide(description: "What the item is, in a few words")
    var itemName: String
    var category: CategoryG
    @Guide(description: "The label words that say what the item is or what is in it, exactly as printed; empty when none")
    var labelText: String
    @Guide(description: "Volts printed on the item, 0 when not printed")
    var volts: Double
    @Guide(description: "Milliamp hours printed on the item, 0 when not printed")
    var milliampHours: Double
    @Guide(description: "Watt hours printed on the item, 0 when not printed")
    var wattHours: Double
    @Guide(description: "Grams of lithium printed on the item, 0 when not printed")
    var lithiumGrams: Double
    @Guide(description: "True when the label mentions a battery")
    var batteryWords: Bool
    var liquid: Bool
    var pressurized: Bool
    var alcoholOnLabel: Bool
    var flammableOnLabel: Bool
    var glassContainer: Bool
    var powder: Bool
    var retailBox: RetailBoxG
    var evidence: EvidenceG

    /// The read as the web app's wire JSON. Label text is cut to 160 characters (counted as code
    /// points, as the web parser does).
    var read: JSONValue {
        .object([
            "itemName": .string(itemName), "category": .string(category.rawValue),
            "labelText": .string(String(String.UnicodeScalarView(labelText.unicodeScalars.prefix(160)))),
            "volts": .number(volts), "milliampHours": .number(milliampHours), "wattHours": .number(wattHours),
            "lithiumGrams": .number(lithiumGrams), "batteryWords": .bool(batteryWords), "liquid": .bool(liquid),
            "pressurized": .bool(pressurized), "alcoholOnLabel": .bool(alcoholOnLabel), "flammableOnLabel": .bool(flammableOnLabel),
            "glassContainer": .bool(glassContainer), "powder": .bool(powder), "retailBox": .string(retailBox.rawValue),
            "evidence": .string(evidence.rawValue),
        ])
    }
}
