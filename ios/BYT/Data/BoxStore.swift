import BYTCore
import Foundation
import Observation

/// Where the box's reads came from, and how many country changes were re-checked with no model.
struct BoxSources: Codable, Equatable, Sendable {
    var onDevice = 0
    var inCloud = 0
    var secondLooks = 0
    var rulesOnlyRechecks = 0
    var cloudFallbacks = 0

    init(onDevice: Int = 0, inCloud: Int = 0, secondLooks: Int = 0, rulesOnlyRechecks: Int = 0, cloudFallbacks: Int = 0) {
        (self.onDevice, self.inCloud, self.secondLooks, self.rulesOnlyRechecks, self.cloudFallbacks) =
            (onDevice, inCloud, secondLooks, rulesOnlyRechecks, cloudFallbacks)
    }

    /// No count goes past this, so a damaged saved file can never make an addition overflow.
    static let maxCount = 1_000_000

    /// A box saved before a count existed starts that count at 0; every count is kept in 0...maxCount.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func count(_ key: CodingKeys) throws -> Int { min(Self.maxCount, max(0, try c.decodeIfPresent(Int.self, forKey: key) ?? 0)) }
        self.init(onDevice: try count(.onDevice), inCloud: try count(.inCloud), secondLooks: try count(.secondLooks),
                  rulesOnlyRechecks: try count(.rulesOnlyRechecks), cloudFallbacks: try count(.cloudFallbacks))
    }

    mutating func add(_ key: WritableKeyPath<BoxSources, Int>, _ n: Int = 1) {
        self[keyPath: key] = min(Self.maxCount, self[keyPath: key] + n)
    }
}

/// A cloud second look that landed on an item: how long it took and why it ran (the screen's words).
struct SecondLookNote: Codable, Equatable, Sendable {
    var ms: Double
    var reason: String
}

/// Which read of a disputed fact the sender picks.
enum DisputeSide: String, Codable, Sendable { case device, cloud }

/// One item in the box: the engine's input fields (the web app's BoxItemInput) plus where its
/// read came from. Never a verdict: verdicts are derived.
struct BoxItem: Codable, Equatable, Identifiable, Sendable {
    var itemId: String
    var read: JSONValue
    var overrides: [String: JSONValue] = [:]
    var answers: [String: String] = [:]
    var quantity = 1
    /// "sender" or "second_look"; nil until someone confirms what the item is.
    var identityConfirmedBy: String?
    var labelTags: [String] = []
    /// The rule edition whose label words made `labelTags`; "" when there was no label text, so the
    /// tags do not depend on the edition; nil when unknown (a box saved before this was kept), which
    /// counts as another edition's. Kept on this iPhone only.
    var tagsEdition: String?
    /// "phone_on_device", "phone_cloud", "manual", or a value another device wrote.
    var readSource: String
    var readMs: Double
    var readFallback: FallbackAfter?
    var cropFile: String?
    /// The whole label a photo read returned, before the read's text was clipped: in memory only, so a
    /// new edition can tag it again. Never saved.
    var wholeLabel: String?
    /// The cloud second look's whole label: a new edition tags it again while its words count. In memory
    /// only, never saved.
    var cloudWholeLabel: String?
    /// Which read's label the sender picked when their words were disputed; nil while both count. In memory
    /// only, like the labels it chooses between.
    var labelPick: DisputeSide?
    /// Set once a cloud second look landed on this item.
    var secondLook: SecondLookNote?
    /// The facts the device read and the second look disagreed on, in the web app's shape
    /// ({ field: { device, cloud, resolved } }); an open one holds the item at "Check this".
    var disputes: JSONValue?
    /// The Wh and lithium-gram figures the item's labels name ({ wh, grams }), as the engine decided them
    /// (labelFiguresJson): kept and saved, since the label text is not. Nil when no label named one, and
    /// for an item saved before they were kept.
    var labelFigures: JSONValue?

    var id: String { itemId }

    var engineInput: JSONValue {
        var input: [String: JSONValue] = ["itemId": .string(itemId), "read": read, "overrides": .object(overrides),
                 "answers": .object(answers.mapValues { .string($0) }), "quantity": .number(Double(quantity)),
                 "identityConfirmedBy": identityConfirmedBy.map { .string($0) } ?? .null,
                 "labelTags": .array(labelTags.map { .string($0) })]
        if let disputes { input["disputes"] = disputes }
        if let labelFigures { input["labelFigures"] = labelFigures }
        return .object(input)
    }

    /// The copy that leaves memory: no label text, read or corrected; the tags stand in for it.
    var forStorage: BoxItem {
        var copy = self
        if case var .object(r) = read {
            r["labelText"] = .string("")
            copy.read = .object(r)
        }
        copy.overrides["labelText"] = nil
        copy.wholeLabel = nil
        copy.cloudWholeLabel = nil
        copy.labelPick = nil
        return copy
    }
}

/// What is saved: the items (without label text), the country, the consent answer and counts.
struct BoxSnapshot: Codable, Equatable, Sendable {
    var boxId: String
    var destinationCode: String
    var items: [BoxItem]
    var cloudConsent: Bool?
    var sources: BoxSources
    /// The cloud question's words an "allowed" answered (`BoxStore.consentVersion`); nil before they
    /// were kept, which counts as the earlier question.
    var cloudConsentVersion: Int?
}

protocol BoxPersistence {
    /// Throws when the box could not be saved; the error's description is shown to the sender.
    func save(_ snapshot: BoxSnapshot) throws
    func load(boxId: String) -> BoxSnapshot?
    /// The sender's cloud choice, kept apart from the box file ("allowed", "declined" or "unasked"),
    /// so a choice whose box save failed still holds after a relaunch. False when it was not written.
    @discardableResult func recordConsent(_ choice: String, boxId: String) -> Bool
    func recordedConsent(boxId: String) -> String?
    /// Deletes everything kept of the box (the box, its cloud choice and anything kept beside them);
    /// throws when some of it is still there.
    func deleteBox(boxId: String) throws
}

extension BoxPersistence {
    /// A box kept only in memory has nothing on disk to delete.
    func deleteBox(boxId: String) throws {}
    /// A box kept only in memory has no separate record: its choice goes with it.
    @discardableResult func recordConsent(_ choice: String, boxId: String) -> Bool { true }
    func recordedConsent(boxId: String) -> String? { nil }
}

// The engine's box result (src/engine/verdict.ts), as the screens read it.
struct RuleHit: Decodable, Equatable, Sendable {
    var ruleId: String, layer: String, level: String, text: String, section: String, url: String
    var askId: String?
}

struct Question: Decodable, Equatable, Sendable {
    struct Answer: Decodable, Equatable, Sendable { var id: String, label: String }
    var id: String, text: String
    var answers: [Answer]
}

struct LayerStatus: Decodable, Equatable, Sendable {
    var id: String, label: String, edition: String, state: String
    var checkedOn: String?
}

struct ItemVerdict: Decodable, Equatable, Sendable {
    /// "ok", "check" or "take_out".
    var level: String
    var headline: String
    var hits: [RuleHit]
    var question: Question?
    var layers: [LayerStatus]
    var service: String?
}

struct LithiumResult: Decodable, Equatable, Sendable {
    var status: String
    var text: String
    var itemIds: [String]
    var unknownItemIds: [String]
}

struct DestinationInfo: Decodable, Equatable, Sendable {
    var code: String, name: String, reviewState: String
    var suspended: Bool
}

struct BoxResult: Decodable, Equatable, Sendable {
    struct Counts: Decodable, Equatable, Sendable { var ok: Int, check: Int, takeOut: Int }
    var items: [String: ItemVerdict]
    var lithium: LithiumResult
    var destination: DestinationInfo
    var notes: [RuleHit]
    var counts: Counts
    var editionId: String
}

/// The box, local-first, with every verdict derived by the rules engine after every change, so a
/// verdict is never read back from storage. Label text stays in memory and with the crop on this
/// iPhone; the saved copy carries only the tags found in it.
@MainActor
@Observable
final class BoxStore {
    static let defaultDestination = "CA"
    /// Why a saved item is checked again: another edition read its label, and the label text was not kept.
    static let rulesChanged = "The rules changed since this label was read. Photograph or type the label again."
    /// The same, for an item saved before the iPhone kept which edition read its label.
    static let labelUnknown = "An earlier version of this app saved this item. Photograph or type the label again."
    /// Why a lithium item waits: the box-wide total may be missing an item whose label is read again.
    static let lithiumWaits = "Another item in this box needs its label read again before the lithium total is known."
    /// The box's lithium line while any item's label must be read again.
    static let lithiumBoxWaits = "An item in this box needs its label read again before the lithium total is known."
    /// Why the cloud choice may not hold after the app is closed: its own record was not written.
    static let consentNotSaved = "Your cloud choice is not saved on this iPhone. Set it again before you close the app."

    /// This box's id; a new one after "Delete everything on this iPhone".
    private(set) var boxId: String
    private(set) var destinationCode = BoxStore.defaultDestination
    private(set) var items: [BoxItem] = []
    private(set) var result: BoxResult?
    private(set) var cloudConsent: Bool?
    private(set) var sources = BoxSources()
    private(set) var lastRecheckMs: Double?
    /// The engine's own error when it could not evaluate the box; the screens say so plainly.
    private(set) var engineProblem: String?
    /// Why the last change is not saved on this iPhone; nil once a save works.
    private(set) var saveProblem: String?
    /// The saved box is there but could not be read yet; "Try saving again" reads it first.
    @ObservationIgnored private var savedBoxUnread = false

    @ObservationIgnored private let engine: RulesEngine
    @ObservationIgnored private let persistence: BoxPersistence
    @ObservationIgnored private let today: () -> String
    @ObservationIgnored private let newId: () -> String
    @ObservationIgnored private let now: () -> Double

    init(engine: RulesEngine, persistence: BoxPersistence, today: @escaping () -> String, newId: @escaping () -> String,
         now: @escaping () -> Double, boxId: String? = nil) {
        self.engine = engine
        self.persistence = persistence
        self.today = today
        self.newId = newId
        self.now = now
        self.boxId = boxId ?? newId()
        result = evaluate()
    }

    /// Merges a saved box under any items already added, then derives the verdicts afresh.
    func load() {
        let saved = persistence.load(boxId: boxId)
        if cloudConsent == nil { cloudConsent = Self.consent(file: saved, record: persistence.recordedConsent(boxId: boxId)) }
        guard let saved else { return }
        savedBoxUnread = false
        // An item id appears once: a damaged file with duplicate ids would make the engine refuse the box.
        var known = Set(items.map(\.itemId))
        let restored = saved.items.filter { known.insert($0.itemId).inserted }
        items = restored + items
        destinationCode = saved.destinationCode
        sources = saved.sources
        commit()
    }

    /// The cloud question's words (ConsentSheet.sentence). 2 names the second look of a read already
    /// made; an "allowed" given to the earlier words is asked again.
    nonisolated static let consentVersion = 2

    /// How a cloud choice is kept in the separate record; an "allowed" carries the question's words.
    nonisolated static func consentRecord(_ choice: Bool?) -> String {
        choice == true ? "allowed-\(consentVersion)" : choice == false ? "declined" : "unasked"
    }

    /// The cloud choice after a relaunch: the stricter of the box file's and the separate record's (off,
    /// then unasked, then allowed), so a choice taken back whose box save failed never comes back. A box
    /// saved before the record existed keeps its own choice. An "allowed" given to earlier words of the
    /// question counts as unasked.
    nonisolated static func consent(file snapshot: BoxSnapshot?, record: String?) -> Bool? {
        let file: Bool? = snapshot?.cloudConsent == true && snapshot?.cloudConsentVersion != consentVersion ? nil : snapshot?.cloudConsent
        guard let record else { return file }
        let recorded: Bool? = record == consentRecord(true) ? true : record == consentRecord(false) ? false : nil
        func rank(_ choice: Bool?) -> Int { choice == false ? 0 : choice == nil ? 1 : 2 }
        return rank(recorded) <= rank(file) ? recorded : file
    }

    @discardableResult
    func addRead(_ outcome: ReadOutcome, cropFile: String?) -> String? {
        guard let read = outcome.read, let source = outcome.source else { return nil }
        let itemId = newId()
        // The parser's tags are from the whole label; the read's own text is clipped and is never tagged.
        // The label's figures come from the whole label too, never from the clipped text.
        let whole = outcome.wholeLabel ?? Self.text(read["labelText"]) ?? ""
        items.append(BoxItem(itemId: itemId, read: read, labelTags: outcome.labelTags, tagsEdition: tagsEdition(read["labelText"]),
                             readSource: source == .onDevice ? "phone_on_device" : "phone_cloud",
                             readMs: outcome.records.reduce(0) { $0 + $1.latencyMs }, readFallback: outcome.fallbackAfter, cropFile: cropFile,
                             wholeLabel: outcome.wholeLabel, labelFigures: figures([whole], kept: nil)))
        sources.add(\.onDevice, source == .onDevice ? 1 : 0)
        sources.add(\.inCloud, source == .cloud ? 1 : 0)
        sources.add(\.cloudFallbacks, outcome.fallbackAfter == nil ? 0 : 1)
        commit()
        return itemId
    }

    @discardableResult
    func addManual(_ read: JSONValue) -> String {
        let itemId = newId()
        // A typed item's numbers are judged on the Wh rules, so its label's figures must outlast the label text,
        // which is not saved. A typed label is never clipped.
        items.append(BoxItem(itemId: itemId, read: read, identityConfirmedBy: "sender", labelTags: tags(read["labelText"]),
                             tagsEdition: tagsEdition(read["labelText"]), readSource: "manual", readMs: 0,
                             labelFigures: figures([Self.text(read["labelText"]) ?? ""], kept: nil)))
        commit()
        return itemId
    }

    /// A remote item keeps the tags of any label text it carries, so the saved copy (which drops the
    /// text) gives the same verdict after a relaunch.
    func mergeRemote(_ item: BoxItem) {
        var item = item
        for tag in tags(item.read["labelText"]) + tags(item.overrides["labelText"]) where !item.labelTags.contains(tag) {
            item.labelTags.append(tag)
        }
        // Another device wrote these tags with the edition both devices follow.
        if let label = labelInMemory(item) { item.tagsEdition = tagsEdition(.string(label)) } else if item.tagsEdition == nil {
            item.tagsEdition = engine.editionId
        }
        if let i = items.firstIndex(where: { $0.itemId == item.itemId }) { items[i] = item } else { items.append(item) }
        commit()
    }

    func confirmIdentity(_ itemId: String) { update(itemId) { $0.identityConfirmedBy = "sender" } }

    func answer(_ itemId: String, question: String, answer: String) { update(itemId) { $0.answers[question] = answer } }

    /// The sender's corrections (the web app's override), with the numbers that come with a typed deciding
    /// number.
    func override(_ itemId: String, patch: [String: JSONValue]) {
        guard let item = items.first(where: { $0.itemId == itemId }) else { return }
        overrideItem(itemId, patch: Self.withShownNumbers(item, patch))
    }

    /// The numbers that come with a typed deciding number, as the sender's own (the web app's
    /// withShownNumbers): with a Wh, the volts and capacity shown (the Wh rules check them against it); with
    /// a lithium metal cell's grams, the volts. Never the other deciding number, never while the two reads
    /// dispute the numbers (open or settled), and never when the sender cleared one (a cleared number can
    /// hide a disagreement between the others).
    nonisolated static let rideAlong: [String: [String]] = ["wattHours": ["volts", "milliampHours"], "lithiumGrams": ["volts"]]
    static func withShownNumbers(_ item: BoxItem, _ patch: [String: JSONValue]) -> [String: JSONValue] {
        func number(_ v: JSONValue?) -> Double? { if case let .number(n)? = v { n } else { nil } }
        let deciding = ["wattHours", "lithiumGrams"].filter { (number(patch[$0]) ?? 0) > 0 }
        let clears = ["volts", "milliampHours", "wattHours", "lithiumGrams"].contains { number(patch[$0]) == 0 }
        guard !deciding.isEmpty, !clears, !numbersDisputed(item.disputes) else { return patch }
        var out = patch
        for f in deciding.flatMap({ rideAlong[$0] ?? [] }) where out[f] == nil {
            if let shown = number(item.overrides[f] ?? item.read[f]), shown > 0 { out[f] = .number(shown) }
        }
        return out
    }

    /// The sender typed the Wh (or lithium grams) printed on the label into an empty field (the web app's
    /// confirmLabelNumber). A match with the model's own reading, within the edition's tolerance, makes the
    /// numbers shown the sender's own; a different number replaces the read one only, and the item is judged
    /// again. The typed number is the one kept, so a limit still applies to it.
    func confirmLabelNumber(_ itemId: String, field: String, value: Double) {
        guard let ride = Self.rideAlong[field], value.isFinite, value > 0,
              let item = items.first(where: { $0.itemId == itemId }) else { return }
        func number(_ v: JSONValue?) -> Double { if case let .number(n)? = v { n } else { 0 } }
        // Only the model's own reading confirms: matching a number the sender typed earlier confirms nothing more.
        let read = item.overrides[field] == nil ? number(item.read[field]) : 0
        // While the two reads dispute the numbers, a match confirms only the number typed, never the others.
        let matches = !Self.numbersDisputed(item.disputes) && read > 0 && whTolerancePct().map { abs(value - read) / read * 100 <= $0 } == true
        var patch: [String: JSONValue] = [field: .number(value)]
        if matches {
            for f in ride { let shown = number(item.overrides[f] ?? item.read[f]); if shown > 0 { patch[f] = .number(shown) } }
        }
        overrideItem(itemId, patch: patch)
    }

    /// The edition's Wh tolerance (limits.whTolerancePct), read from the edition in force; nil when it
    /// cannot be read, and then no typed number matches a reading.
    private func whTolerancePct() -> Double? {
        guard let text = try? engine.canonicalEdition(),
              let edition = try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)),
              case let .number(pct)? = edition["limits"]?["whTolerancePct"] else { return nil }
        return pct
    }

    /// A corrected label replaces the read one, so its tags must survive the label text not being saved.
    /// The sender's own correction of a disputed fact settles that dispute.
    private func overrideItem(_ itemId: String, patch: [String: JSONValue]) {
        update(itemId) { item in
            item.overrides.merge(patch) { _, new in new }
            if let label = patch["labelText"] {
                item.labelTags = tags(label)
                // Blank words are not a label: a stale item stays stale until real words are read.
                if hasWords(label) || !isStale(item) { item.tagsEdition = tagsEdition(label) }
                // A label the sender typed adds its figures to the kept ones (its text is not kept).
                let typed = Self.text(label) ?? ""
                item.labelFigures = figures(item.labelFigures == nil ? [Self.deviceLabel(item), typed] : [typed], kept: item.labelFigures)
            }
            if case var .object(all)? = item.disputes {
                for field in Self.disputeFields where Self.corrects(patch, field, all[field]) {
                    if case var .object(d)? = all[field] { d["resolved"] = .bool(true); all[field] = .object(d) }
                }
                item.disputes = .object(all)
            }
            if Self.typesNumbers(patch) { Self.numbersByHand(&item) }
        }
    }

    /// Whether these corrections type any battery number: the volts, mAh, Wh or lithium grams.
    static func typesNumbers(_ patch: [String: JSONValue]) -> Bool {
        ["volts", "milliampHours", "wattHours", "lithiumGrams"].contains { patch[$0] != nil }
    }

    /// Battery numbers the sender typed (any of them), or picked between two readings, are theirs and not a
    /// second look's: the rules let only a second look that read the same numbers stand behind them
    /// (USPS-INTL-LI-ONE-READ). An item nobody confirmed stays unconfirmed.
    static func numbersByHand(_ item: inout BoxItem) {
        if item.identityConfirmedBy == "second_look" { item.identityConfirmedBy = "sender" }
    }

    /// The disputes that are about the numbers: while either is recorded, open or settled, the reads did
    /// not agree on them.
    nonisolated static let numberDisputes = ["battery", "lithiumGrams"]
    static func numbersDisputed(_ disputes: [String: JSONValue]) -> Bool { numberDisputes.contains { disputes[$0] != nil } }
    static func numbersDisputed(_ disputes: JSONValue?) -> Bool {
        if case let .object(d)? = disputes { numbersDisputed(d) } else { false }
    }

    /// Whether a matching second look still stands behind the item (the web app's secondLookStands): no one
    /// typed its numbers (a cleared one included) or picked between readings, and the reads never disputed
    /// them. The rules count it then, and the card says so: one check for both.
    static func secondLookStands(_ item: BoxItem) -> Bool {
        item.identityConfirmedBy == "second_look" && !typesNumbers(item.overrides) && !numbersDisputed(item.disputes)
    }

    /// What the rules are told (the web app's forRules): a second look stands behind the numbers only when
    /// no one typed or picked them. This holds for an item saved by an earlier build too, and changes
    /// nothing that is saved.
    static func forRules(_ item: BoxItem) -> JSONValue {
        var told = item
        if item.identityConfirmedBy == "second_look", !secondLookStands(item) { told.identityConfirmedBy = "sender" }
        guard case var .object(input) = told.engineInput else { return told.engineInput }
        // A typed item's numbers are the sender's own; any other read's are a model's (left out, the engine
        // counts them read).
        if item.readSource == "manual" { input["numbersFrom"] = .string("typed") }
        return .object(input)
    }

    /// Who stands behind an item once a second look lands (the web app's secondLookIdentity). Same kind of
    /// item, numbers that agree and none typed: the second look, even over an earlier tap of "Yes, this
    /// is". Numbers typed while it ran: the sender. Numbers the two reads gave differently, or another kind
    /// of item than the one the box has: never the second look, as an earlier one no longer holds; the
    /// sender's own confirmation stays.
    static func secondLookIdentity(_ item: BoxItem, sameKind: Bool, found: [String: JSONValue]) -> String? {
        let earlier = item.identityConfirmedBy == "second_look" ? nil : item.identityConfirmedBy
        if !sameKind { return earlier }
        if typesNumbers(item.overrides) { return "sender" }
        if numbersDisputed(found) { return earlier }
        return "second_look"
    }

    /// The facts two reads can dispute, in the web app's order (src/engine/types.ts DISPUTE_FIELDS).
    nonisolated static let disputeFields = ["category", "retailBox", "battery", "lithiumGrams", "batteryWords", "liquid", "pressurized",
                                "alcoholOnLabel", "flammableOnLabel", "glassContainer", "powder", "labelTags", "evidence"]

    /// Whether these corrections settle a disputed fact (the web app's rule): the label words only with a
    /// corrected label, any other fact by itself, and the battery only by the sender's own numbers, every
    /// one that either read gave (all three when the dispute's readings are not known).
    static func corrects(_ patch: [String: JSONValue], _ field: String, _ dispute: JSONValue? = nil) -> Bool {
        switch field {
        case "battery":
            let all = ["volts", "milliampHours", "wattHours"]
            func given(_ side: JSONValue?, _ f: String) -> Bool { if case let .number(n)? = side?[f] { n > 0 } else { false } }
            let needed = dispute.map { d in all.filter { given(d["device"], $0) || given(d["cloud"], $0) } } ?? all
            return (needed.isEmpty ? all : needed).allSatisfy { patch[$0] != nil }
        case "labelTags": return patch["labelText"] != nil
        default: return patch[field] != nil
        }
    }

    /// The label words that can change a verdict: every tag but the one that only says a label was read.
    static func wordsOf(_ tags: [String]) -> String { Set(tags.filter { $0 != "label_text" }).sorted().joined(separator: ",") }

    /// What each read of a second look called the item and said on its label, kept in memory only, so
    /// a picked side brings its own words back (the web app's lookLabels).
    private struct LookLabels {
        var device: String, cloud: String
        var deviceName: String?, cloudName: String?
    }
    @ObservationIgnored private var lookLabels: [String: LookLabels] = [:]

    private static func text(_ v: JSONValue?) -> String? { if case let .string(s)? = v { s } else { nil } }

    /// A cloud second look landed (the web app's applySecondLook). The merged read replaces the device's;
    /// the item keeps the tags of every label either read saw, never only the merged one, so a hazard word
    /// in the shorter label still counts; a label word only one read saw becomes a dispute of tags (never of
    /// label text); a fact the sender corrected while the cloud read ran keeps no dispute; and the item
    /// counts as confirmed only when both reads saw the same kind of item. `cloudLabel` is the cloud read's
    /// whole label.
    func applySecondLook(_ itemId: String, merged: JSONValue, ms: Double, reason: String, cloudLabel: String?,
                         disputes: JSONValue = .object([:])) {
        sources.add(\.secondLooks)
        let shown = cloudLabel.map { String(String.UnicodeScalarView($0.unicodeScalars.prefix(ReadDraft.labelTextMax))) }
        let cloudTags = tags(cloudLabel.map { .string($0) })
        update(itemId) { item in
            lookLabels[itemId] = LookLabels(device: Self.text(item.read["labelText"]) ?? "", cloud: shown ?? "",
                                            deviceName: Self.text(item.read["itemName"]), cloudName: Self.text(merged["itemName"]))
            var found: [String: JSONValue] = if case let .object(o) = disputes { o } else { [:] }
            if cloudLabel != nil, Self.wordsOf(item.labelTags) != Self.wordsOf(cloudTags) {
                found["labelTags"] = .object(["device": .array(item.labelTags.map { .string($0) }),
                                              "cloud": .array(cloudTags.map { .string($0) }), "resolved": .bool(false)])
            }
            for field in Self.disputeFields where Self.corrects(item.overrides, field, found[field]) { found[field] = nil }
            // Both reads' label figures, the kept ones first so none is pushed out: a figure only one label named
            // counts. Taken before the merged read replaces the device's.
            item.labelFigures = figures(item.labelFigures == nil ? [Self.deviceLabel(item), cloudLabel ?? ""] : [cloudLabel ?? ""],
                                        kept: item.labelFigures)
            // The kind of item the box has now, with the sender's own correction over the read.
            let sameKind = merged["category"] == (item.overrides["category"] ?? item.read["category"])
            // A label the sender corrected while the cloud read ran stays theirs: only its tags count.
            if item.overrides["labelText"] == nil {
                let added = cloudLabel == nil ? tags(merged["labelText"]) : cloudTags
                for tag in added where !item.labelTags.contains(tag) { item.labelTags.append(tag) }
                if !added.isEmpty { item.tagsEdition = engine.editionId }
                // Both labels stay in memory, so a new edition tags both again: the first read's before
                // the merged read replaces its text, and the cloud's.
                if item.wholeLabel == nil { item.wholeLabel = Self.text(item.read["labelText"]) }
                item.cloudWholeLabel = cloudLabel ?? Self.text(merged["labelText"])
                item.labelPick = nil
            }
            item.read = merged
            item.secondLook = SecondLookNote(ms: ms, reason: reason)
            item.identityConfirmedBy = Self.secondLookIdentity(item, sameKind: sameKind, found: found)
            item.disputes = found.isEmpty ? nil : .object(found)
        }
    }

    /// The sender picks one read of a disputed fact (the web app's settleDispute): that reading is used and
    /// judged. Picking the label brings back that read's words, and its text while this iPhone still has
    /// it; picking what the item is confirms it, and names it as that read did (or by its category, once
    /// this iPhone no longer has that read's name).
    func settleDispute(_ itemId: String, field: String, side: DisputeSide) {
        update(itemId) { item in
            guard case var .object(all)? = item.disputes, case var .object(d)? = all[field], let value = d[side.rawValue],
                  case var .object(read) = item.read else { return }
            d["resolved"] = .bool(true)
            all[field] = .object(d)
            item.disputes = .object(all)
            // The picked reading is what the rules judge: an earlier correction of the same facts (a part
            // of the battery numbers, say) no longer stays on top of it.
            let keys = field == "battery" ? ["volts", "milliampHours", "wattHours"] : field == "labelTags" ? ["labelText"] : [field]
            for key in keys { item.overrides[key] = nil }
            switch field {
            case "battery":
                for key in ["volts", "milliampHours", "wattHours"] { if let v = value[key] { read[key] = v } }
            case "labelTags":
                // The picked label, tagged by the edition in force when this iPhone still has it; else the
                // words saved with the dispute, which a rule update tags again with the label (refreshStaleTags).
                let picked = side == .cloud ? item.cloudWholeLabel : item.wholeLabel
                if let picked, hasWords(.string(picked)) {
                    item.labelTags = tags(.string(picked))
                    item.tagsEdition = engine.editionId
                } else if case let .array(values) = value {
                    item.labelTags = values.compactMap { if case let .string(s) = $0 { s } else { nil } }
                }
                if let words = lookLabels[itemId] { read["labelText"] = .string(side == .device ? words.device : words.cloud) }
                // Only the picked read's label is tagged again by a new edition; both labels stay, so a later
                // pick of the other side still has its own.
                item.labelPick = side
            default:
                read[field] = value
                if field == "category" {
                    let names = lookLabels[itemId]
                    let category = Self.text(value) ?? ""
                    read["itemName"] = .string((side == .device ? names?.deviceName : names?.cloudName)
                        ?? ReadDraft.categories.first { $0.id == category }?.label ?? category)
                    if item.identityConfirmedBy == nil { item.identityConfirmedBy = "sender" }
                }
            }
            // A battery reading or lithium grams the sender picked are the sender's numbers.
            if field == "battery" || field == "lithiumGrams" { Self.numbersByHand(&item) }
            item.read = .object(read)
        }
    }

    /// The sender's fix from "Fix this reading": the changed fields on top of the read, and when the
    /// fix says what the item is, the sender also confirms it.
    func applyFix(_ itemId: String, patch: [String: JSONValue]) {
        guard !patch.isEmpty else { return }
        override(itemId, patch: patch)
        if patch["evidence"] != nil { confirmIdentity(itemId) }
    }

    func setQuantity(_ itemId: String, _ n: Double) {
        update(itemId) { $0.quantity = n.isFinite ? min(99, max(1, Int(n.rounded()))) : 1 }
    }

    func remove(_ itemId: String) {
        items.removeAll { $0.itemId == itemId }
        lookLabels[itemId] = nil
        commit()
    }

    /// A country change re-runs the rules on the reads already made: no model call.
    func setDestination(_ code: String) {
        guard code != destinationCode else { return }
        destinationCode = code
        let start = now()
        let fresh = evaluate()
        lastRecheckMs = now() - start
        sources.add(\.rulesOnlyRechecks)
        commit(fresh)
    }

    /// Derives every verdict again with nothing changed in the box: the day or the edition moved.
    /// It writes nothing, so a saved box that could not be read is never replaced; only tags read
    /// again from a label still in memory are saved.
    func reevaluate() {
        if refreshStaleTags() { commit() } else { result = evaluate() }
    }

    /// The sender's "Try saving again": saves the box as it is now. When the saved box could not be
    /// read yet, it is read first, under what was added meanwhile, and the verdicts derived again.
    func retrySave() {
        if savedBoxUnread {
            load()
            if !savedBoxUnread { return }
        }
        commit(result)
    }

    /// The choice is recorded apart from the box file first, so it holds even when the box save fails.
    func setConsent(_ value: Bool?) {
        let recorded = persistence.recordConsent(Self.consentRecord(value), boxId: boxId)
        cloudConsent = value
        commit(result)
        // Said even when the box saved, so the sender knows the choice may not hold after a relaunch.
        if !recorded { saveProblem = Self.consentNotSaved }
    }

    /// "Delete everything on this iPhone": deletes every file of this box (the box, its cloud choice,
    /// anything kept beside them), then starts an empty box under `newBoxId`, with no cloud choice and
    /// nothing saved until the sender adds something. When the files could not all be deleted, it
    /// throws and the box on screen stays as it is.
    func deleteEverything(newBoxId: String) throws {
        try persistence.deleteBox(boxId: boxId)
        boxId = newBoxId
        items = []
        cloudConsent = nil
        sources = BoxSources()
        destinationCode = Self.defaultDestination
        lastRecheckMs = nil
        lookLabels = [:]
        saveProblem = nil
        savedBoxUnread = false
        result = evaluate()
    }

    // MARK: Plumbing

    private func update(_ itemId: String, _ change: (inout BoxItem) -> Void) {
        guard let i = items.firstIndex(where: { $0.itemId == itemId }) else { return }
        change(&items[i])
        commit()
    }

    private func commit(_ fresh: BoxResult?? = nil) {
        result = fresh ?? evaluate()
        do {
            try persistence.save(BoxSnapshot(boxId: boxId, destinationCode: destinationCode, items: items.map(\.forStorage),
                                             cloudConsent: cloudConsent, sources: sources,
                                             cloudConsentVersion: cloudConsent == true ? Self.consentVersion : nil))
            saveProblem = nil
        } catch {
            saveProblem = (error as? LocalizedError)?.errorDescription ?? "This change is not saved on this iPhone."
            if (error as? BoxFiles.SaveError)?.savedBoxUnread == true { savedBoxUnread = true }
        }
    }

    private func evaluate() -> BoxResult? {
        refreshStaleTags()
        // The rules are told who stands behind each item's numbers; the stored items stay as they are.
        let input: JSONValue = .object(["items": .array(items.map(Self.forRules)), "code": .string(destinationCode),
                                        "today": .string(today())])
        do {
            let value = try engine.evaluateBox(input)
            engineProblem = nil
            return guardStaleTags(try value.decode(BoxResult.self))
        } catch {
            engineProblem = String(describing: error)
            return nil
        }
    }

    private func isStale(_ item: BoxItem) -> Bool {
        guard let current = engine.editionId else { return false }
        // Unknown provenance counts as another edition's; no label words depend on no edition.
        guard let tagged = item.tagsEdition else { return true }
        return !tagged.isEmpty && tagged != current
    }

    /// The label text this iPhone still holds (a corrected label wins), if it has any words.
    private func labelInMemory(_ item: BoxItem) -> String? {
        // A corrected label first, then the whole label a photo read returned; the read's clipped text last
        // (a typed read, whose label is never clipped).
        let whole = item.wholeLabel.map { JSONValue.string($0) }
        guard let label = item.overrides["labelText"] ?? whole ?? item.read["labelText"], hasWords(label), case let .string(text) = label else { return nil }
        return text
    }

    private func hasWords(_ label: JSONValue?) -> Bool {
        guard case let .string(text)? = label else { return false }
        return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Another edition is in force: a label still in memory is read again with its label words.
    /// True when any item's tags changed.
    @discardableResult
    private func refreshStaleTags() -> Bool {
        var changed = false
        for i in items.indices where isStale(items[i]) {
            let labels = labelsInMemory(items[i])
            guard !labels.isEmpty else { continue }
            var found: [String] = []
            for label in labels { for tag in tags(.string(label)) where !found.contains(tag) { found.append(tag) } }
            items[i].labelTags = found
            items[i].tagsEdition = engine.editionId
            // An open dispute of label words keeps each side's words from the same edition as the item's.
            if case var .object(all)? = items[i].disputes, case var .object(d)? = all["labelTags"], d["resolved"] != .bool(true) {
                func words(_ label: String?) -> JSONValue? {
                    guard let label, hasWords(.string(label)) else { return nil }
                    return .array(tags(.string(label)).map { .string($0) })
                }
                if let device = words(items[i].wholeLabel) { d["device"] = device }
                if let cloud = words(items[i].cloudWholeLabel) { d["cloud"] = cloud }
                // When the new edition finds the same words on both labels, nothing is left to choose.
                func strings(_ v: JSONValue?) -> [String] {
                    if case let .array(a)? = v { a.compactMap { if case let .string(s) = $0 { s } else { nil } } } else { [] }
                }
                if Self.wordsOf(strings(d["device"])) == Self.wordsOf(strings(d["cloud"])) { d["resolved"] = .bool(true) }
                all["labelTags"] = .object(d)
                items[i].disputes = .object(all)
            }
            changed = true
        }
        return changed
    }

    /// Every label this iPhone still holds for an item, which a new edition tags again: a corrected label
    /// alone; otherwise the picked read's label, or, while no side is picked, the read's and the cloud's.
    private func labelsInMemory(_ item: BoxItem) -> [String] {
        if case let .string(text)? = item.overrides["labelText"], hasWords(.string(text)) { return [text] }
        let first = item.wholeLabel.map { JSONValue.string($0) } ?? item.read["labelText"]
        let cloud = item.cloudWholeLabel.map { JSONValue.string($0) }
        let labels: [JSONValue?] = switch item.labelPick {
        case .device?: [first]
        case .cloud?: [cloud]
        case nil: [first, cloud]
        }
        return labels.compactMap { label in
            if case let .string(text)? = label, hasWords(label) { text } else { nil }
        }
    }

    /// A saved item whose tags another edition found, with its label gone, is never OK: the sender
    /// is asked to read the label again.
    private func guardStaleTags(_ result: BoxResult) -> BoxResult {
        var result = result
        func withhold(_ id: String, _ reason: String) {
            guard var verdict = result.items[id], verdict.level == "ok" else { return }
            verdict.level = "check"
            verdict.headline = "Check this"
            verdict.hits.insert(RuleHit(ruleId: "DATA-LABEL-AGAIN", layer: "data", level: "check", text: reason,
                                        section: "Before You Tape: reading check", url: "https://before-you-tape-2026.web.app/rules"),
                                at: 0)
            result.items[id] = verdict
            result.counts.ok -= 1
            result.counts.check += 1
        }
        var staleInBox = false
        for item in items where isStale(item) {
            // Even marked "Take out", the item is in the box until the sender removes it.
            staleInBox = true
            withhold(item.itemId, item.tagsEdition == nil ? Self.labelUnknown : Self.rulesChanged)
        }
        // The lithium total is box-wide: an item whose label must be read again may add to it, so no
        // lithium item is OK on that total, and the box says the total waits, until it is read or removed.
        if staleInBox, result.lithium.status == "ok" || result.lithium.status == "none" {
            result.lithium.status = "depends"
            result.lithium.text = Self.lithiumBoxWaits
            for id in result.lithium.itemIds { withhold(id, Self.lithiumWaits) }
        }
        return result
    }

    private func tagsEdition(_ label: JSONValue?) -> String? {
        hasWords(label) ? engine.editionId : ""
    }

    /// The whole label the device read returned, while this iPhone has it; else the read's own text.
    private static func deviceLabel(_ item: BoxItem) -> String { item.wholeLabel ?? text(item.read["labelText"]) ?? "" }

    /// The figures an item keeps from these whole labels and its figures so far, as the engine decides them
    /// (labelFiguresJson): Swift reads no label itself. If the engine refuses, the item keeps what it had,
    /// and a box the engine then cannot judge says so (engineProblem).
    private func figures(_ labels: [String], kept: JSONValue?) -> JSONValue? {
        do { return try engine.labelFigures(texts: labels, kept: kept) } catch { return kept }
    }

    private func tags(_ label: JSONValue?) -> [String] {
        guard case let .string(text)? = label, !text.isEmpty, case let .array(values)? = try? engine.labelTags(text) else { return [] }
        return values.compactMap { if case let .string(s) = $0 { s } else { nil } }
    }
}
