import BYTCore
import FirebaseFirestore
import Foundation
import Observation

/// The iPhone client's state.
@MainActor
@Observable
final class AppModel {
    let signIn: SignIn
    private(set) var signedIn = false
    private(set) var onDevice: OnDeviceStatus
    /// The web app's rules engine; nil only when its bundled script would not load.
    let engine: RulesEngine?
    /// Reads items on Apple's model or, when allowed, on Gemini through Firebase AI Logic.
    let reader: ItemReader?
    /// The box, with verdicts from the rule edition bundled with the app.
    let box: BoxStore?
    /// The countries the edition in force covers, for the country picker.
    private(set) var destinations: [Destination]
    let network = NetworkStatus()
    let camera = CameraSession()
    /// The last read and the box item it made, for the line under the camera.
    private(set) var lastRead: ReadOutcome?
    private(set) var lastItemId: String?
    /// True while the one-time cloud question is on screen; the read waits for the answer.
    private(set) var askingConsent = false
    private var pending: ItemInput?
    /// The exact crop the last photo read used, shown to the sender under the line.
    private(set) var lastCrop: Data?
    /// The crop waiting for the cloud question, shown in it.
    var pendingCrop: Data? { if case let .photo(crop)? = pending { crop } else { nil } }
    /// Remote Config as last applied; reads use it at once, with no restart.
    private(set) var config = RemoteConfigValues.defaults
    /// Why a newer rule edition was not used, when one was named and refused.
    private(set) var editionNotice: String?
    let appVersion: String
    @ObservationIgnored private let remoteConfig = RemoteConfigLoader()
    @ObservationIgnored private let fetchEdition: @Sendable (String) async -> String?
    @ObservationIgnored private let bundledEditionText: String?
    @ObservationIgnored private let pause: PauseSwitch
    /// Counts edition requests; only the latest one installs its answer.
    @ObservationIgnored private var editionRequest = 0
    /// The pin whose edition is installed (empty means the built-in edition). A pin that could not
    /// be installed is tried again when it arrives again, back in the foreground, and when the
    /// network returns.
    @ObservationIgnored private var installedPin = AppModel.pinKey(RemoteConfigValues.defaults)
    /// The retry started by the foreground or the network, for anyone who must wait for it.
    @ObservationIgnored private(set) var editionRetry: Task<Void, Never>?
    /// Label words longer than this are cut: a label's words fit well inside it.
    static let maxWords = 500

    /// Reads Apple's model status now; asked again before each read and when the app comes back.
    @ObservationIgnored private let onDeviceStatus: @MainActor () -> OnDeviceStatus

    init(signIn: SignIn = .firebase(), onDeviceStatus: @escaping @MainActor () -> OnDeviceStatus = { ModelSessionFactory.onDeviceStatus() },
         persistence: BoxPersistence = BoxFiles(), reader: ItemReader? = nil, defaults: UserDefaults = .standard,
         today: @escaping () -> String = { AppModel.localDate(Date()) },
         appVersion: String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
         fetchEdition: @escaping @Sendable (String) async -> String? = AppModel.firestoreEdition) {
        self.appVersion = appVersion
        self.fetchEdition = fetchEdition
        self.signIn = signIn
        self.onDeviceStatus = onDeviceStatus
        self.onDevice = onDeviceStatus()
        let engine = try? RulesEngine()
        let editionText = Bundle.main.url(forResource: "edition", withExtension: "json").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
        if let engine, let editionText { _ = try? engine.setEdition(editionText) }
        self.bundledEditionText = editionText
        self.destinations = editionText.map(Self.destinations(fromEdition:)) ?? []
        self.engine = engine
        let pause = PauseSwitch()
        self.pause = pause
        self.reader = reader ?? engine.map { Self.makeReader(engine: $0, signIn: signIn, pause: pause) }
        let boxId = Self.currentBoxId(defaults)
        self.box = engine.map {
            BoxStore(engine: $0, persistence: persistence, today: today, newId: { UUID().uuidString },
                     now: { Date().timeIntervalSince1970 * 1000 }, boxId: boxId)
        }
        // The saved box comes back before anything is added.
        box?.load()
        network.onReconnect = { [weak self] in self?.retryEdition() }
    }

    /// The iPhone's own calendar date, YYYY-MM-DD, which the rule layers' freshness is checked against.
    nonisolated static func localDate(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Every cloud runner sits behind the sign-in and the live pause switch; every answer passes the engine's parser.
    static func makeReader(engine: RulesEngine, signIn: SignIn, pause: PauseSwitch) -> ItemReader {
        ItemReader(
            device: DeviceRunner(),
            makeCloud: { model in
                SignedInCloudRunner(ensureSignedIn: { await signIn.ensure() }, cloudOpen: { !pause.paused },
                                    inner: CloudRunner(ai: AIClient.make(useLimitedUseTokens: true), model: model))
            },
            parse: { read in
                guard let data = try? JSONEncoder().encode(read) else { return nil }
                return try? engine.parseItemRead(String(decoding: data, as: UTF8.self))
            })
    }

    func start() async {
        network.start()
        remoteConfig.onChange = { [weak self] values in Task { await self?.applyConfig(values) } }
        remoteConfig.start()
        signedIn = await signIn.ensure()
        onDevice = onDeviceStatus()
    }

    /// Back in the foreground: a model that finished downloading meanwhile counts at once, and every
    /// verdict is derived again, because a rule layer may have gone out of date while it was away.
    func becameActive() {
        onDevice = onDeviceStatus()
        box?.reevaluate()
        retryEdition()
    }

    /// Starts one more try for a pinned edition that is not installed yet.
    private func retryEdition() {
        guard Self.pinKey(config) != installedPin else { return }
        editionRetry = Task { await followEditionPin() }
    }

    /// The local date changed while the app was open: rule freshness is checked against the day.
    func dayChanged() {
        box?.reevaluate()
    }

    /// Reads one cropped photo on the router's path and adds what it read to the box. The cloud is
    /// used only when the sender allowed it and the phone is online (and every cloud call signs in first).
    func readPhoto(_ jpeg: Data) async { await read(.photo(cropJPEG: jpeg)) }

    /// Label words the sender typed or scanned with the keyboard: read on this iPhone when it can.
    func readWords(_ text: String) async {
        let words = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxWords))
        guard !words.isEmpty else { return }
        await read(.words(words))
    }

    private func read(_ input: ItemInput) async {
        guard let reader, let box else { return }
        onDevice = onDeviceStatus()
        let situation = ReadSituation(status: onDevice, online: network.online, cloudConsent: box.cloudConsent, config: config)
        // Asked once, before the first cloud call: nothing goes to the cloud until the sender picks.
        if box.cloudConsent == nil, ItemReader.needsCloud(input.kind, situation) {
            pending = input
            askingConsent = true
            return
        }
        // The pause switch is read again, live, before every cloud call of this read.
        var live = reader
        live.cloudOpen = { [weak self] in !(self?.config.killCloud ?? true) }
        let outcome = await live.read(input, situation: situation)
        if case let .photo(crop) = input { lastCrop = crop } else { lastCrop = nil }
        lastKind = input.kind
        lastRead = outcome
        lastItemId = box.addRead(outcome, cropFile: nil)
    }

    /// The sender's answer to the cloud question; a waiting photo is read after it.
    func answerConsent(_ allow: Bool) async {
        askingConsent = false
        box?.setConsent(allow)
        guard let input = pending else { return }
        pending = nil
        await read(input)
    }

    private(set) var lastKind: ReadInputKind = .photo

    var readLine: String? {
        // The name and the verdict both come from the box item as it is now, corrections included.
        let item = lastItemId.flatMap { id in box?.items.first { $0.itemId == id } }
        return Self.readLine(lastRead, verdict: lastItemId.flatMap { box?.result?.items[$0] }, consent: box?.cloudConsent, kind: lastKind,
                             name: item.flatMap { FixReadingView.current($0).text("itemName") })
    }

    static func readLine(_ outcome: ReadOutcome?, verdict: ItemVerdict?, consent: Bool? = nil, kind: ReadInputKind = .photo,
                         name current: String? = nil) -> String? {
        guard let outcome else { return nil }
        if let read = outcome.read, let source = outcome.source, let verdict {
            // The item's current name wins, even when the sender cleared it; the model's first name
            // is used only when there is no item to ask.
            let chosen = (current ?? read.text("itemName") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let name = chosen.isEmpty ? "This item" : chosen
            return "\(name): \(verdict.headline). " + (source == .onDevice ? "Read on this iPhone." : "Read in the cloud.")
        }
        if outcome.route == .blocked, kind == .labelWords {
            return "This iPhone cannot read label words right now, and the cloud is not allowed."
        }
        if outcome.route == .blocked {
            return consent == false ? "You chose to keep everything on this iPhone, and this iPhone does not read photos yet."
                                    : "Checking a photo needs the cloud, and the cloud is not allowed yet."
        }
        if outcome.failure == .notSignedIn { return "Not signed in yet. Check the network and try again." }
        return "That item could not be read. Try another photo."
    }

    /// Applies new Remote Config values. A rule edition pin that is not installed yet is checked
    /// and, only when it checks out, loaded; the box's verdicts are then derived again.
    func applyConfig(_ values: RemoteConfigValues) async {
        config = values
        pause.paused = values.killCloud
        await followEditionPin()
    }

    nonisolated static func pinKey(_ c: RemoteConfigValues) -> String { c.rulesEditionId + "@" + c.rulesEditionSha256 }

    private func followEditionPin() async {
        let want = Self.pinKey(config)
        // Every new wish, even a return to the installed pin, makes any request still running stale.
        editionRequest += 1
        let request = editionRequest
        guard want != installedPin, let engine, let bundledEditionText else { return }
        let choice = await EditionSource.choose(bundledText: bundledEditionText, wantId: config.rulesEditionId,
                                                wantSha: config.rulesEditionSha256, fetchRemote: fetchEdition)
        // A newer request may have started while this one was checked: only the latest installs
        // anything, and only for the pin still wanted.
        guard request == editionRequest, Self.pinKey(config) == want else { return }
        var installed = choice.text
        if (try? engine.setEdition(choice.text)) != nil {
            editionNotice = choice.notice
        } else {
            _ = try? engine.setEdition(bundledEditionText)
            installed = bundledEditionText
            editionNotice = EditionSource.notRead
        }
        // The picker and the verdicts move to the new edition in the same step.
        destinations = Self.destinations(fromEdition: installed)
        // Only a pin that was met counts as installed; the built-in fallback is tried again later.
        installedPin = editionNotice == nil ? want : ""
        box?.reevaluate()
    }

    var updateLine: String? {
        RemoteConfigValues.isBelowMinimum(current: appVersion, minimum: config.minimumVersionIOS)
            ? "This version is out of date. Update the app to keep checking items." : nil
    }

    /// A published edition lives at ruleEditions/{id} as { json, sha256 }; missing or malformed gives nil.
    nonisolated static let firestoreEdition: @Sendable (String) async -> String? = { id in
        guard let snapshot = try? await Firestore.firestore().collection("ruleEditions").document(id).getDocument() else { return nil }
        return snapshot.data()?["json"] as? String
    }

    nonisolated static let boxIdKey = "currentBoxId"

    /// The box this iPhone is filling: the same id every launch, so its saved file is found again.
    nonisolated static func currentBoxId(_ defaults: UserDefaults) -> String {
        if let id = defaults.string(forKey: boxIdKey), !id.isEmpty { return id }
        let id = UUID().uuidString
        defaults.set(id, forKey: boxIdKey)
        return id
    }

    /// The edition's countries, by code.
    nonisolated static func destinations(fromEdition text: String) -> [Destination] {
        guard let edition = try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)),
              case let .object(all)? = edition["destinations"] else { return [] }
        return all.compactMap { code, d in
            if case let .string(name)? = d["name"] { Destination(code: code, name: name) } else { nil }
        }.sorted { $0.code < $1.code }
    }
}

struct Destination: Equatable, Sendable {
    let code: String
    let name: String
}
