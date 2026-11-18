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

    /// A box saved before a count existed starts that count at 0.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(onDevice: try c.decodeIfPresent(Int.self, forKey: .onDevice) ?? 0,
                  inCloud: try c.decodeIfPresent(Int.self, forKey: .inCloud) ?? 0,
                  secondLooks: try c.decodeIfPresent(Int.self, forKey: .secondLooks) ?? 0,
                  rulesOnlyRechecks: try c.decodeIfPresent(Int.self, forKey: .rulesOnlyRechecks) ?? 0,
                  cloudFallbacks: try c.decodeIfPresent(Int.self, forKey: .cloudFallbacks) ?? 0)
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
    /// "phone_on_device", "phone_cloud", "manual", or a value another device wrote.
    var readSource: String
    var readMs: Double
    var readFallback: FallbackAfter?
    var cropFile: String?

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
    func save(_ snapshot: BoxSnapshot)
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

    let boxId: String
    private(set) var destinationCode = BoxStore.defaultDestination
    private(set) var items: [BoxItem] = []
    private(set) var result: BoxResult?
    private(set) var cloudConsent: Bool?
    private(set) var sources = BoxSources()
    private(set) var lastRecheckMs: Double?
    /// The engine's own error when it could not evaluate the box; the screens say so plainly.
    private(set) var engineProblem: String?

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
        let known = Set(items.map(\.itemId))
        items = saved.items.filter { !known.contains($0.itemId) } + items
        destinationCode = saved.destinationCode
        if cloudConsent == nil { cloudConsent = saved.cloudConsent }
        sources = saved.sources
        commit()
    }

    @discardableResult
    func addRead(_ outcome: ReadOutcome, cropFile: String?) -> String? {
        guard let read = outcome.read, let source = outcome.source else { return nil }
        let itemId = newId()
        items.append(BoxItem(itemId: itemId, read: read, labelTags: tags(read["labelText"]),
                             readSource: source == .onDevice ? "phone_on_device" : "phone_cloud",
                             readMs: outcome.records.reduce(0) { $0 + $1.latencyMs }, readFallback: outcome.fallbackAfter, cropFile: cropFile))
        sources.onDevice += source == .onDevice ? 1 : 0
        sources.inCloud += source == .cloud ? 1 : 0
        sources.cloudFallbacks += outcome.fallbackAfter == nil ? 0 : 1
        commit()
        return itemId
    }

    @discardableResult
    func addManual(_ read: JSONValue) -> String {
        let itemId = newId()
        items.append(BoxItem(itemId: itemId, read: read, identityConfirmedBy: "sender", labelTags: tags(read["labelText"]),
                             readSource: "manual", readMs: 0))
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
        if let i = items.firstIndex(where: { $0.itemId == item.itemId }) { items[i] = item } else { items.append(item) }
        commit()
    }

    func confirmIdentity(_ itemId: String) { update(itemId) { $0.identityConfirmedBy = "sender" } }

    func answer(_ itemId: String, question: String, answer: String) { update(itemId) { $0.answers[question] = answer } }

    /// A corrected label replaces the read one, so its tags must survive the label text not being saved.
    func override(_ itemId: String, patch: [String: JSONValue]) {
        update(itemId) { item in
            item.overrides.merge(patch) { _, new in new }
            if let label = patch["labelText"] { item.labelTags = tags(label) }
        }
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
        sources.rulesOnlyRechecks += 1
        commit(fresh)
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
        persistence.save(BoxSnapshot(boxId: boxId, destinationCode: destinationCode, items: items.map(\.forStorage),
                                     cloudConsent: cloudConsent, sources: sources))
    }

    private func evaluate() -> BoxResult? {
        let input: JSONValue = .object(["items": .array(items.map(\.engineInput)), "code": .string(destinationCode),
                                        "today": .string(today())])
        do {
            let value = try engine.evaluateBox(input)
            engineProblem = nil
            return try value.decode(BoxResult.self)
        } catch {
            engineProblem = String(describing: error)
            return nil
        }
    }

    private func tags(_ label: JSONValue?) -> [String] {
        guard case let .string(text)? = label, !text.isEmpty, case let .array(values)? = try? engine.labelTags(text) else { return [] }
        return values.compactMap { if case let .string(s) = $0 { s } else { nil } }
    }
}
