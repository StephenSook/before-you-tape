import BYTCore
import Foundation

/// An item read as the sender edits it: plain fields, numbers kept as typed text so a half-typed
/// value is not lost, an empty number meaning "not printed" (0), and no negative numbers. The web
/// app's rules (src/ui/ReadFields.tsx, FixReading.tsx, AddByHand.tsx).
struct ReadDraft: Equatable, Sendable {
    struct Category: Equatable, Sendable { let id: String, label: String }

    static let numberFields: [(id: String, label: String)] = [
        ("volts", "Volts (V)"), ("milliampHours", "Milliamp-hours (mAh)"), ("wattHours", "Watt-hours (Wh)"), ("lithiumGrams", "Lithium (grams)"),
    ]
    static let flagFields: [(id: String, label: String)] = [
        ("liquid", "It is a liquid"), ("pressurized", "It is a spray or under pressure"), ("alcoholOnLabel", "The label lists alcohol"),
        ("flammableOnLabel", "The label says flammable"), ("glassContainer", "It is in glass"), ("powder", "It is a powder"),
        ("batteryWords", "The label mentions a battery"),
    ]
    static let boxChoices: [(id: String, label: String)] = [
        ("sealed", "Still sealed in its box"), ("open_or_none", "Opened, or no box"), ("cannot_tell", "Can't tell"),
    ]
    /// The web app's plain-words names for the categories, in its order (src/ui/categoryLabels.ts).
    static let categories: [Category] = [
        ("perfume_fragrance", "Perfume or cologne"), ("nail_polish", "Nail polish"), ("aerosol_spray", "Spray can"),
        ("hand_sanitizer", "Hand sanitizer"), ("lotion_cream", "Lotion or cream"),
        ("liquid_toiletry", "Shampoo, soap or other liquid toiletry"), ("makeup", "Makeup"), ("powder", "Powder"),
        ("medicine", "Medicine or vitamins"), ("alcohol_drink", "Alcoholic drink"), ("food_packaged", "Packaged food"),
        ("chocolate", "Chocolate or sweets"), ("coffee", "Coffee or tea"), ("cooking_oil", "Cooking oil"),
        ("meat_product", "Meat product"), ("phone", "Phone"), ("tablet", "Tablet"), ("laptop", "Laptop"),
        ("smartwatch", "Smartwatch"), ("earbuds", "Earbuds or headphones"), ("power_bank", "Power bank"),
        ("loose_battery", "Loose battery"), ("battery_toy", "Toy with a battery"), ("musical_card", "Card that plays music"),
        ("other_electronics", "Other electronics"), ("lighter_matches", "Lighter or matches"),
        ("e_cigarette", "E-cigarette or vape"), ("glue_paint", "Glue or paint"), ("knife_tool", "Knife or tool"),
        ("toy_gun", "Toy gun"), ("candle", "Candle"), ("jewelry_watch", "Jewelry or watch"), ("clothing", "Clothing"),
        ("shoes", "Shoes"), ("book_paper", "Book or paper"), ("toy", "Toy"), ("other", "Something else"),
    ].map { Category(id: $0.0, label: $0.1) }

    var itemName = ""
    /// "" until the sender picks one.
    var category = ""
    var labelText = ""
    var numbers: [String: String] = [:]
    var flags: [String: Bool] = [:]
    var retailBox = "cannot_tell"

    static func of(_ read: JSONValue?) -> ReadDraft {
        var d = ReadDraft()
        d.itemName = read?.text("itemName") ?? ""
        d.category = read?.text("category") ?? ""
        d.labelText = read?.text("labelText") ?? ""
        for (f, _) in numberFields {
            let n = read?.num(f) ?? 0
            d.numbers[f] = n == 0 ? "" : (n.rounded() == n && abs(n) < 1e15 ? String(Int64(n)) : String(n))
        }
        for (f, _) in flagFields { d.flags[f] = read?.flag(f) ?? false }
        d.retailBox = read?.text("retailBox") ?? "cannot_tell"
        return d
    }

    /// The typed number, 0 for an empty field, or nil when it is not a number of zero or more.
    static func parseNumber(_ text: String) -> Double? {
        let t = text.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { return 0 }
        guard let n = Double(t), n.isFinite, n >= 0 else { return nil }
        return n
    }

    var numbersValid: Bool { Self.numberFields.allSatisfy { Self.parseNumber(numbers[$0.id] ?? "") != nil } }

    /// The engine's longest label (its contract's labelTextMax), counted in Unicode code points as
    /// the engine counts them. A longer label would make it refuse the whole box.
    static let labelTextMax = 160
    var labelValid: Bool { labelText.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars.count <= Self.labelTextMax }
    var canSave: Bool { numbersValid && labelValid }

    /// Only the fields the sender changed, as overrides on top of the read.
    func changed(from read: JSONValue) -> [String: JSONValue] {
        var patch: [String: JSONValue] = [:]
        if itemName != read.text("itemName") { patch["itemName"] = .string(itemName) }
        if !category.isEmpty, category != read.text("category") { patch["category"] = .string(category) }
        if labelText != read.text("labelText") { patch["labelText"] = .string(labelText) }
        for (f, _) in Self.numberFields {
            if let n = Self.parseNumber(numbers[f] ?? ""), n != read.num(f) { patch[f] = .number(n) }
        }
        for (f, _) in Self.flagFields where (flags[f] ?? false) != read.flag(f) { patch[f] = .bool(flags[f] ?? false) }
        if retailBox != read.text("retailBox") { patch["retailBox"] = .string(retailBox) }
        return patch
    }

    /// A fix as saved: the changed fields, and when the sender said what the item is, their word as
    /// the evidence (the label they typed, or what they say it is), so an unsure read is resolved.
    /// Only a new category or new label words say what it is: a new name alone does not (renaming
    /// an unsure "Shirt" to "My shirt" adds nothing), and neither does clearing the label.
    func fixPatch(from read: JSONValue) -> [String: JSONValue] {
        var patch = changed(from: read)
        let label = labelText.trimmingCharacters(in: .whitespacesAndNewlines)
        if patch["category"] != nil || (patch["labelText"] != nil && !label.isEmpty) {
            patch["evidence"] = .string(label.isEmpty ? "item_seen" : "label_read")
        }
        return patch
    }

    /// An item the sender typed instead of showing it; nil until it says what the item is and every
    /// number is valid. Typed label words count as a read label; otherwise the sender only says what it is.
    func manualRead() -> JSONValue? {
        guard !category.isEmpty, canSave else { return nil }
        let label = labelText.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = itemName.trimmingCharacters(in: .whitespacesAndNewlines)
        var o: [String: JSONValue] = [
            "itemName": .string(name.isEmpty ? (Self.categories.first { $0.id == category }?.label ?? category) : name),
            "category": .string(category), "labelText": .string(label), "retailBox": .string(retailBox),
            "evidence": .string(label.isEmpty ? "item_seen" : "label_read"),
        ]
        for (f, _) in Self.numberFields { o[f] = .number(Self.parseNumber(numbers[f] ?? "") ?? 0) }
        for (f, _) in Self.flagFields { o[f] = .bool(flags[f] ?? false) }
        return .object(o)
    }
}

extension JSONValue {
    func text(_ key: String) -> String? { if case let .string(s)? = self[key] { s } else { nil } }
    func num(_ key: String) -> Double? { if case let .number(n)? = self[key] { n } else { nil } }
    func flag(_ key: String) -> Bool { if case let .bool(b)? = self[key] { b } else { false } }
}
