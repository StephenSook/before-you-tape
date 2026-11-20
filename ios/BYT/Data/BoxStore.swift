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

    var id: String { itemId }

    var engineInput: JSONValue {
        .object(["itemId": .string(itemId), "read": read, "overrides": .object(overrides),
                 "answers": .object(answers.mapValues { .string($0) }), "quantity": .number(Double(quantity)),
                 "identityConfirmedBy": identityConfirmedBy.map { .string($0) } ?? .null,
                 "labelTags": .array(labelTags.map { .string($0) })])
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
}

protocol BoxPersistence {
    /// Throws when the box could not be saved; the error's description is shown to the sender.
    func save(_ snapshot: BoxSnapshot) throws
    func load(boxId: String) -> BoxSnapshot?
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

    let boxId: String
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
        guard let saved = persistence.load(boxId: boxId) else { return }
        savedBoxUnread = false
        // An item id appears once: a damaged file with duplicate ids would make the engine refuse the box.
        var known = Set(items.map(\.itemId))
        let restored = saved.items.filter { known.insert($0.itemId).inserted }
        items = restored + items
        destinationCode = saved.destinationCode
        if cloudConsent == nil { cloudConsent = saved.cloudConsent }
        sources = saved.sources
        commit()
    }

    @discardableResult
    func addRead(_ outcome: ReadOutcome, cropFile: String?) -> String? {
        guard let read = outcome.read, let source = outcome.source else { return nil }
        let itemId = newId()
        // The parser's tags are from the whole label; the read's own text is clipped and is never tagged.
        items.append(BoxItem(itemId: itemId, read: read, labelTags: outcome.labelTags, tagsEdition: tagsEdition(read["labelText"]),
                             readSource: source == .onDevice ? "phone_on_device" : "phone_cloud",
                             readMs: outcome.records.reduce(0) { $0 + $1.latencyMs }, readFallback: outcome.fallbackAfter, cropFile: cropFile,
                             wholeLabel: outcome.wholeLabel))
        sources.add(\.onDevice, source == .onDevice ? 1 : 0)
        sources.add(\.inCloud, source == .cloud ? 1 : 0)
        sources.add(\.cloudFallbacks, outcome.fallbackAfter == nil ? 0 : 1)
        commit()
        return itemId
    }

    @discardableResult
    func addManual(_ read: JSONValue) -> String {
        let itemId = newId()
        items.append(BoxItem(itemId: itemId, read: read, identityConfirmedBy: "sender", labelTags: tags(read["labelText"]),
                             tagsEdition: tagsEdition(read["labelText"]), readSource: "manual", readMs: 0))
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

    /// A corrected label replaces the read one, so its tags must survive the label text not being saved.
    func override(_ itemId: String, patch: [String: JSONValue]) {
        update(itemId) { item in
            item.overrides.merge(patch) { _, new in new }
            if let label = patch["labelText"] {
                item.labelTags = tags(label)
                // Blank words are not a label: a stale item stays stale until real words are read.
                if hasWords(label) || !isStale(item) { item.tagsEdition = tagsEdition(label) }
            }
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

    func setConsent(_ value: Bool?) {
        cloudConsent = value
        commit(result)
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
                                             cloudConsent: cloudConsent, sources: sources))
            saveProblem = nil
        } catch {
            saveProblem = (error as? LocalizedError)?.errorDescription ?? "This change is not saved on this iPhone."
            if (error as? BoxFiles.SaveError)?.savedBoxUnread == true { savedBoxUnread = true }
        }
    }

    private func evaluate() -> BoxResult? {
        refreshStaleTags()
        let input: JSONValue = .object(["items": .array(items.map(\.engineInput)), "code": .string(destinationCode),
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
            guard let label = labelInMemory(items[i]) else { continue }
            items[i].labelTags = tags(.string(label))
            items[i].tagsEdition = engine.editionId
            changed = true
        }
        return changed
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

    private func tags(_ label: JSONValue?) -> [String] {
        guard case let .string(text)? = label, !text.isEmpty, case let .array(values)? = try? engine.labelTags(text) else { return [] }
        return values.compactMap { if case let .string(s) = $0 { s } else { nil } }
    }
}
