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
    /// True when the last photo was of no item (a camera pointed at a room) and was not added.
    private(set) var lastWasNoItem = false
    static let noItem = "Nothing to check there. Hold one item inside the box."
    /// True while the one-time cloud question is on screen; the read waits for the answer.
    private(set) var askingConsent = false
    private var pending: ItemInput?
    /// The exact crop the last photo read used, shown to the sender under the line.
    private(set) var lastCrop: Data?
    /// The crop waiting for the cloud question, shown in it: an offered look's, or a photo's to read.
    var pendingCrop: Data? {
        if let id = lookAwaitingConsent { return pendingLooks[id]?.crop }
        if case let .photo(crop)? = pending { return crop }
        return nil
    }
    /// Remote Config as last applied; reads use it at once, with no restart. It starts held (no cloud)
    /// until Remote Config gives a kill switch of its own.
    private(set) var config: RemoteConfigValues
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
    /// Set when the engine would not load or refused the shipped edition: then nothing is checked.
    let rulesProblem: String?
    static let rulesFailed = "This app's rules could not load. Update the app."

    /// The rule edition shipped in the app.
    nonisolated static func shippedEdition() -> String? {
        Bundle.main.url(forResource: "edition", withExtension: "json").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    }

    /// Label words longer than this are cut: a label's words fit well inside it.
    static let maxWords = 500

    /// Reads Apple's model status now; asked again before each read and when the app comes back.
    @ObservationIgnored private let onDeviceStatus: @MainActor () -> OnDeviceStatus

    init(signIn: SignIn = .firebase(), onDeviceStatus: @escaping @MainActor () -> OnDeviceStatus = { ModelSessionFactory.onDeviceStatus() },
         persistence: BoxPersistence = BoxFiles(), reader: ItemReader? = nil, defaults: UserDefaults = .standard,
         today: @escaping () -> String = { AppModel.localDate(Date()) },
         appVersion: String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
         fetchEdition: @escaping @Sendable (String) async -> String? = AppModel.firestoreEdition,
         editionText: String? = AppModel.shippedEdition(), config: RemoteConfigValues = .held) {
        self.config = config
        self.appVersion = appVersion
        self.fetchEdition = fetchEdition
        self.signIn = signIn
        self.onDeviceStatus = onDeviceStatus
        self.onDevice = onDeviceStatus()
        // The engine counts only once it has loaded the shipped edition; a refusal is said, not swallowed.
        let engine: RulesEngine? = {
            guard let engine = try? RulesEngine(), let editionText, (try? engine.setEdition(editionText)) != nil else { return nil }
            return engine
        }()
        self.rulesProblem = engine == nil ? Self.rulesFailed : nil
        self.bundledEditionText = editionText
        self.destinations = engine == nil ? [] : editionText.map(Self.destinations(fromEdition:)) ?? []
        self.engine = engine
        let pause = PauseSwitch()
        pause.paused = config.killCloud
        self.pause = pause
        self.reader = reader ?? engine.map { Self.makeReader(engine: $0, signIn: signIn, pause: pause) }
        let boxId = Self.currentBoxId(defaults)
        self.box = engine.map {
            BoxStore(engine: $0, persistence: persistence, today: today, newId: { UUID().uuidString },
                     now: { Date().timeIntervalSince1970 * 1000 }, boxId: boxId)
        }
        // The saved box comes back before anything is added.
        box?.load()
        refreshCloudGate()
        network.onReconnect = { [weak self] in
            self?.retryEdition()
            self?.runLooksWaitingForOnline()
        }
    }

    /// True while uploads may start: the server has not paused the cloud and the sender allowed it.
    private var cloudAllowed: Bool { !config.killCloud && box?.cloudConsent == true }

    /// The upload gate every cloud runner checks at the moment it would send. Closing it (a pause,
    /// or the sender turning cloud checks off) cancels every upload still running.
    private func refreshCloudGate() { pause.paused = !cloudAllowed }

    /// Whether the upload gate is open now.
    var cloudGateOpen: Bool { !pause.paused }

    struct CloudChoice: Equatable {
        let line: String
        let button: String
    }

    /// The sender's cloud choice and how to change it; nil while it has not been made (the cloud
    /// question asks it before the first cloud call). As in the web app.
    var cloudChoice: CloudChoice? {
        switch box?.cloudConsent {
        case true?: CloudChoice(line: "Cloud checks are on.", button: "Turn off cloud checks")
        case false?: CloudChoice(line: "Cloud checks are off. Photos and label words stay on this iPhone.", button: "Turn on cloud checks")
        case nil: nil
        }
    }

    /// Takes the cloud choice back: nothing more is sent, and an upload still running is cancelled. The
    /// gate closes first, before the choice is saved, so no upload can start while the save runs.
    func turnOffCloudChecks() {
        pause.paused = true
        forgetLooks { _ in true }
        box?.setConsent(false)
        refreshCloudGate()
    }

    /// Clears the choice, so the cloud question is asked again before the next cloud call. The gate
    /// closes first, as when cloud checks are turned off, and every look not landed is forgotten.
    func turnOnCloudChecks() {
        pause.paused = true
        forgetLooks { _ in true }
        box?.setConsent(nil)
        refreshCloudGate()
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
                SignedInCloudRunner(ensureSignedIn: { await signIn.ensure() }, pause: pause,
                                    inner: CloudRunner(ai: AIClient.make(useLimitedUseTokens: true), model: model))
            },
            parse: { read in
                guard let data = try? JSONEncoder().encode(read),
                      let parsed = try? engine.parseItemReadTagged(String(decoding: data, as: UTF8.self)) else { return nil }
                // The parser checked the label is text; the whole of it stays in memory for tagging again.
                let whole: String? = if case let .string(text)? = read["labelText"] { text } else { nil }
                return ParsedRead(read: parsed.read, labelTags: parsed.labelTags, wholeLabel: whole)
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
        // A choice that came back with a late load counts from this read on.
        refreshCloudGate()
        onDevice = onDeviceStatus()
        let situation = ReadSituation(status: onDevice, online: network.online, cloudConsent: box.cloudConsent, config: config)
        // Asked once, before the first cloud call: nothing goes to the cloud until the sender picks.
        if box.cloudConsent == nil, ItemReader.needsCloud(input.kind, situation) {
            pending = input
            askingConsent = true
            return
        }
        // The pause and the sender's choice are read again, live, before every cloud call of this read.
        var live = reader
        live.cloudOpen = { [weak self] in self?.cloudAllowed ?? false }
        let outcome = await live.read(input, situation: situation)
        if case let .photo(crop) = input { lastCrop = crop } else { lastCrop = nil }
        lastKind = input.kind
        lastRead = outcome
        // A photo of no item is dropped, as the web app drops it, by the web app's own check.
        lastWasNoItem = input.kind == .photo && outcome.read.map { (try? engine?.isNoItem($0)) == true } == true
        lastItemId = lastWasNoItem ? nil : box.addRead(outcome, cropFile: nil)
        // A photo read on this iPhone may get a cloud second look of the same crop (the web app looks again
        // at photos only, never at typed words).
        if case let .photo(crop) = input, outcome.source == .onDevice, let id = lastItemId, let deviceRead = outcome.read {
            planSecondLook(id, deviceRead: deviceRead, crop: crop)
        }
    }

    // MARK: Cloud second look (the web app's Pack page: src/pages/PackPage.tsx)

    /// Why an item was looked at again, the web app's own sentences (src/ai/secondLook.ts).
    static let secondLookText: [String: String] = [
        "wh_mismatch": "The watt-hours on the label did not match the volts and capacity, so the cloud read it again.",
        "battery_numbers": "Battery numbers decide what may be mailed, so the cloud read them again.",
        "not_sure": "The first read was not sure what this is, so the cloud looked again.",
        "hazard_no_label": "Items like this need their label read, so the cloud looked again.",
        "identity": "The first read could not confirm what this is, so the cloud looked again.",
    ]

    /// A failed second look leaves the device read and its verdict in place, and says why (the web app's
    /// words; a refusal names no browser).
    static func secondLookFailure(_ f: ReadFailure) -> String {
        switch f {
        case .cloudPaused: "Cloud checks are off right now, so this was not checked again."
        case .network: "No connection. This check will run when you are back online."
        case .parseFailed: "The second look did not make sense. Try again."
        case .timeout: "The cloud step took too long. Try again."
        case .appCheckRefused, .notSignedIn, .rateLimited: "The cloud step was refused. Try again in a minute."
        default: "The cloud step did not run. Try again."
        }
    }

    private struct PendingLook {
        var reason: String
        var deviceRead: JSONValue
        var crop: Data
        /// This look's own id: a send checks it is still the item's look, so a look forgotten (and any
        /// call still on its way) can never send for a later one.
        var token = UUID()
    }
    /// Looks still to land, by item: what to read again and why. Forgotten, crop and all, when the item
    /// is removed or cloud checks are taken back.
    @ObservationIgnored private var pendingLooks: [String: PendingLook] = [:]
    /// Items being looked at again right now, and any look's failure, for the item's card.
    private var checkingAgain: Set<String> = []
    private var lookErrors: [String: String] = [:]
    /// Looks the rules want while the cloud question is unanswered: offered on the card, and asked first.
    private var offeredLooks: Set<String> = []
    /// The offered look the cloud question is being asked for, if any.
    private(set) var lookAwaitingConsent: String?
    /// Looks that failed for no connection; they run again when the iPhone is back online.
    @ObservationIgnored private var waitingForOnline: Set<String> = []
    /// The looks running or waiting, each with its item. Each one drops its own entry when it ends;
    /// removing the item or taking back cloud checks cancels it.
    @ObservationIgnored private var lookTasks: [UUID: (itemId: String, task: Task<Void, Never>)] = [:]

    /// Seconds to wait before automatic try `n` (1, 2, 3) of a look that failed for no connection.
    @ObservationIgnored var lookBackoff: (Int) -> Double = { n in 2 * pow(2, Double(n - 1)) }
    /// How many times a look that failed for no connection is tried again by itself; then the card asks.
    static let lookAutoTries = 3
    /// Automatic tries made so far, by item; reset by a look that worked and by "Try again".
    @ObservationIgnored private var lookAutoTried: [String: Int] = [:]

    var pendingLookCount: Int { pendingLooks.count }
    var lookTaskCount: Int { lookTasks.count }

    /// Waits until no look runs or waits.
    func waitForSecondLooks() async {
        while let entry = lookTasks.values.first { await entry.task.value }
    }

    /// Removes an item from the box, and every look of it with it: nothing more is sent for it, and its
    /// crop is forgotten.
    func remove(_ itemId: String) {
        forgetLooks { $0 == itemId }
        box?.remove(itemId)
    }

    /// Cancels the matching items' looks and forgets their crops, failures and waits.
    private func forgetLooks(_ match: (String) -> Bool) {
        for entry in lookTasks.values where match(entry.itemId) { entry.task.cancel() }
        pendingLooks = pendingLooks.filter { !match($0.key) }
        lookErrors = lookErrors.filter { !match($0.key) }
        waitingForOnline = waitingForOnline.filter { !match($0) }
        lookAutoTried = lookAutoTried.filter { !match($0.key) }
        offeredLooks = offeredLooks.filter { !match($0) }
        if let id = lookAwaitingConsent, match(id) { lookAwaitingConsent = nil }
    }

    func isCheckingAgain(_ itemId: String) -> Bool { checkingAgain.contains(itemId) }
    func isLookOffered(_ itemId: String) -> Bool { offeredLooks.contains(itemId) && !checkingAgain.contains(itemId) }

    /// The card's "Check it in the cloud": runs the offered look when cloud checks are allowed, and asks
    /// the cloud question first when they were never answered.
    func checkInTheCloud(_ itemId: String) {
        guard offeredLooks.contains(itemId), let box else { return }
        switch box.cloudConsent {
        case true?:
            offeredLooks.remove(itemId)
            startLook(itemId)
        case nil:
            lookAwaitingConsent = itemId
            askingConsent = true
        case false?:
            break
        }
    }
    func secondLookError(_ itemId: String) -> String? { lookErrors[itemId] }

    /// The engine decides whether the item gets a look; it runs only if the cloud is allowed now.
    private func planSecondLook(_ itemId: String, deviceRead: JSONValue, crop: Data) {
        guard let engine, let item = box?.items.first(where: { $0.itemId == itemId }) else { return }
        let policy = try? JSONDecoder().decode(JSONValue.self, from: Data(config.secondLookPolicyJSON.utf8))
        // A policy or item the engine refuses gives no reason, so no cloud call.
        guard let reason = try? engine.secondLookReason(item: item.engineInput, source: ReadPath.onDevice.rawValue, policy: policy) else { return }
        if cloudAllowed, network.online {
            pendingLooks[itemId] = PendingLook(reason: reason, deviceRead: deviceRead, crop: crop)
            startLook(itemId)
        } else if box?.cloudConsent == nil, !config.killCloud {
            // Never asked, or asked with the question's earlier words: the card offers the look and asks
            // first. Nothing is sent until the sender allows it.
            pendingLooks[itemId] = PendingLook(reason: reason, deviceRead: deviceRead, crop: crop)
            offeredLooks.insert(itemId)
        }
    }

    /// The sender's "Try again" on a look that failed: it starts afresh, with its automatic tries again.
    func retrySecondLook(_ itemId: String) {
        lookAutoTried[itemId] = nil
        startLook(itemId)
    }

    /// One look per item at a time: a new one cancels any earlier one (running, waiting its turn, or
    /// waiting to try again) and starts only once that one has ended, so no item ever has two looks
    /// sending.
    private func startLook(_ itemId: String, after seconds: Double = 0) {
        let earlier = lookTasks.values.filter { $0.itemId == itemId }.map(\.task)
        earlier.forEach { $0.cancel() }
        let id = UUID()
        let task = Task { [weak self] in
            for task in earlier { await task.value }
            if seconds > 0 { try? await Task.sleep(for: .seconds(seconds)) }
            if !Task.isCancelled { await self?.runSecondLook(itemId) }
            self?.lookTasks[id] = nil
        }
        lookTasks[id] = (itemId, task)
    }

    /// A look that failed for no connection: tried again by itself up to `lookAutoTries` times, after a
    /// wait while the iPhone says it is online (a reconnect may have come and gone while the call failed),
    /// or when the iPhone is back online. Then the card says to try again.
    private func lookFailedForNoConnection(_ itemId: String) {
        let tried = lookAutoTried[itemId, default: 0]
        guard tried < Self.lookAutoTries else {
            lookAutoTried[itemId] = nil
            lookErrors[itemId] = Self.secondLookFailure(.other)
            return
        }
        lookAutoTried[itemId] = tried + 1
        lookErrors[itemId] = Self.secondLookFailure(.network)
        if network.online { startLook(itemId, after: lookBackoff(tried + 1)) } else { waitingForOnline.insert(itemId) }
    }

    private func runLooksWaitingForOnline() {
        let ids = waitingForOnline
        waitingForOnline.removeAll()
        for id in ids { startLook(id) }
    }

    private func runSecondLook(_ itemId: String) async {
        guard let look = pendingLooks[itemId], let reader, let box, let engine else { return }
        // An item removed from the box is never sent to the cloud again.
        guard box.items.contains(where: { $0.itemId == itemId }) else { pendingLooks[itemId] = nil; return }
        refreshCloudGate()
        guard cloudAllowed, network.online else {
            if !network.online { waitingForOnline.insert(itemId) }
            lookErrors[itemId] = Self.secondLookFailure(network.online ? .cloudPaused : .network)
            return
        }
        checkingAgain.insert(itemId)
        var live = reader
        // Read at the moment of each send, also after waiting for another look's lane: the cloud allowed,
        // and this look not forgotten (its item still in the box, cloud checks not taken back).
        let token = look.token
        live.cloudOpen = { [weak self] in
            guard let self else { return false }
            return self.cloudAllowed && self.pendingLooks[itemId]?.token == token
                && self.box?.items.contains(where: { $0.itemId == itemId }) == true
        }
        let situation = ReadSituation(status: onDevice, online: network.online, cloudConsent: box.cloudConsent, config: config)
        let outcome = await live.secondLook(.photo(cropJPEG: look.crop), situation: situation)
        checkingAgain.remove(itemId)
        // A look replaced by a newer one (it was cancelled) lands nothing and says nothing.
        if Task.isCancelled { return }
        // A look forgotten while it ran lands nothing and says nothing.
        guard pendingLooks[itemId] != nil, box.items.contains(where: { $0.itemId == itemId }) else {
            pendingLooks[itemId] = nil
            return
        }
        if let cloud = outcome.read, let merged = try? engine.mergeSecondLook(device: look.deviceRead, cloud: cloud) {
            let label: String? = if case let .string(s)? = cloud["labelText"] { s } else { nil }
            box.applySecondLook(itemId, merged: merged.merged, ms: outcome.records.reduce(0) { $0 + $1.latencyMs },
                                reason: Self.secondLookText[look.reason] ?? look.reason, cloudLabel: outcome.wholeLabel ?? label,
                                disputes: merged.disputes)
            pendingLooks[itemId] = nil
            // A look that worked replaces any earlier failure of it.
            lookErrors[itemId] = nil
            lookAutoTried[itemId] = nil
        } else if let failure = outcome.failure, failure == .network {
            lookFailedForNoConnection(itemId)
        } else {
            lookErrors[itemId] = Self.secondLookFailure(outcome.failure ?? .parseFailed)
        }
    }

    /// The sender's answer to the cloud question; a waiting photo is read after it, and an offered look
    /// it was asked for runs (or, kept on the iPhone, every offered look is forgotten).
    func answerConsent(_ allow: Bool) async {
        askingConsent = false
        if !allow { forgetLooks { _ in true } }
        box?.setConsent(allow)
        refreshCloudGate()
        if let id = lookAwaitingConsent {
            lookAwaitingConsent = nil
            if allow {
                offeredLooks.remove(id)
                startLook(id)
            }
        }
        guard let input = pending else { return }
        pending = nil
        await read(input)
    }

    private(set) var lastKind: ReadInputKind = .photo

    var readLine: String? {
        if lastWasNoItem { return Self.noItem }
        // The name and the verdict both come from the box item as it is now, corrections included.
        let item = lastItemId.flatMap { id in box?.items.first { $0.itemId == id } }
        return Self.readLine(lastRead, verdict: lastItemId.flatMap { box?.result?.items[$0] }, consent: box?.cloudConsent, kind: lastKind,
                             name: item.flatMap { FixReadingView.current($0).text("itemName") }, settingsPending: config.pauseUnknown,
                             status: onDevice)
    }

    /// Shown on the check screen when a photo is not read on this iPhone: why, and what to do instead.
    var photoNotice: String? { onDevice.readsPhotos ? nil : ReadyCheck.photoLine(onDevice) }

    static func readLine(_ outcome: ReadOutcome?, verdict: ItemVerdict?, consent: Bool? = nil, kind: ReadInputKind = .photo,
                         name current: String? = nil, settingsPending: Bool = false, status: OnDeviceStatus? = nil) -> String? {
        guard let outcome else { return nil }
        if let read = outcome.read, let source = outcome.source, let verdict {
            // The item's current name wins, even when the sender cleared it; the model's first name
            // is used only when there is no item to ask.
            let chosen = (current ?? read.text("itemName") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let name = chosen.isEmpty ? "This item" : chosen
            return "\(name): \(verdict.headline). " + (source == .onDevice ? "Read on this iPhone." : "Read in the cloud.")
        }
        let waiting = "cloud checks are waiting for their settings. Try again in a moment."
        if outcome.route == .blocked, kind == .labelWords {
            return settingsPending && consent != false ? "This iPhone cannot read label words right now, and " + waiting
                                                       : "This iPhone cannot read label words right now, and the cloud is not allowed."
        }
        // A photo blocked here could not go to this iPhone's model: say why, and what to do instead.
        let wordsHere = status?.available == true
        let instead = wordsHere ? "Type the label's words instead." : "Add it by hand with Type it in Your box."
        if outcome.route == .blocked {
            if consent == false {
                let why = wordsHere ? "this iPhone's model does not read photos" : "Apple's on-device model is not available on it"
                return "You chose to keep everything on this iPhone, and \(why). \(instead)"
            }
            return settingsPending ? "Checking a photo needs the cloud, and " + waiting
                                   : "Checking a photo needs the cloud, and the cloud is not allowed right now. \(instead)"
        }
        if outcome.failure == .notSignedIn { return "Not signed in yet. Check the network and try again." }
        if outcome.failure == .cloudPaused, consent == false { return "Cloud checks are off, so this was not checked." }
        if outcome.route == .deviceOnly, kind == .photo {
            return "This iPhone could not read that photo. Try another photo, or type the label's words instead."
        }
        return "That item could not be read. Try another photo."
    }

    /// Applies new Remote Config values. A rule edition pin that is not installed yet is checked
    /// and, only when it checks out, loaded; the box's verdicts are then derived again.
    func applyConfig(_ values: RemoteConfigValues) async {
        config = values
        refreshCloudGate()
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
