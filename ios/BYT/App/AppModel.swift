import BYTCore
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
    let network = NetworkStatus()
    let camera = CameraSession()
    /// The last read and the box item it made, for the line under the camera.
    private(set) var lastRead: ReadOutcome?
    private(set) var lastItemId: String?
    /// True while the one-time cloud question is on screen; the photo waits for the answer.
    private(set) var askingConsent = false
    @ObservationIgnored private var pendingPhoto: Data?

    init(signIn: SignIn = .firebase(), onDevice: OnDeviceStatus = ModelSessionFactory.onDeviceStatus(),
         persistence: BoxPersistence = BoxFiles(), reader: ItemReader? = nil) {
        self.signIn = signIn
        self.onDevice = onDevice
        let engine = try? RulesEngine()
        if let engine, let url = Bundle.main.url(forResource: "edition", withExtension: "json"),
           let text = try? String(contentsOf: url, encoding: .utf8) {
            _ = try? engine.setEdition(text)
        }
        self.engine = engine
        self.reader = reader ?? engine.map { Self.makeReader(engine: $0, signIn: signIn) }
        self.box = engine.map {
            BoxStore(engine: $0, persistence: persistence, today: { AppModel.localDate(Date()) }, newId: { UUID().uuidString },
                     now: { Date().timeIntervalSince1970 * 1000 })
        }
    }

    /// The iPhone's own calendar date, YYYY-MM-DD, which the rule layers' freshness is checked against.
    nonisolated static func localDate(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Every cloud runner sits behind the sign-in; every answer passes the engine's parser.
    static func makeReader(engine: RulesEngine, signIn: SignIn) -> ItemReader {
        ItemReader(
            device: DeviceRunner(),
            makeCloud: { model in
                SignedInCloudRunner(ensureSignedIn: { await signIn.ensure() },
                                    inner: CloudRunner(ai: AIClient.make(useLimitedUseTokens: true), model: model))
            },
            parse: { read in
                guard let data = try? JSONEncoder().encode(read) else { return nil }
                return try? engine.parseItemRead(String(decoding: data, as: UTF8.self))
            })
    }

    func start() async {
        network.start()
        box?.load()
        signedIn = await signIn.ensure()
        onDevice = ModelSessionFactory.onDeviceStatus()
    }

    /// Reads one cropped photo on the router's path and adds what it read to the box. The cloud is
    /// used only when the sender allowed it and the phone is online (and every cloud call signs in first).
    func readPhoto(_ jpeg: Data) async {
        guard let reader, let box else { return }
        let situation = ReadSituation(status: onDevice, online: network.online, cloudConsent: box.cloudConsent, config: .defaults)
        // Asked once, before the first cloud call: nothing goes to the cloud until the sender picks.
        if box.cloudConsent == nil, ItemReader.needsCloud(.photo, situation) {
            pendingPhoto = jpeg
            askingConsent = true
            return
        }
        let outcome = await reader.read(.photo(cropJPEG: jpeg), situation: situation)
        lastRead = outcome
        lastItemId = box.addRead(outcome, cropFile: nil)
    }

    /// The sender's answer to the cloud question; a waiting photo is read after it.
    func answerConsent(_ allow: Bool) async {
        askingConsent = false
        box?.setConsent(allow)
        guard let photo = pendingPhoto else { return }
        pendingPhoto = nil
        await readPhoto(photo)
    }

    var readLine: String? {
        Self.readLine(lastRead, verdict: lastItemId.flatMap { box?.result?.items[$0] }, consent: box?.cloudConsent)
    }

    static func readLine(_ outcome: ReadOutcome?, verdict: ItemVerdict?, consent: Bool? = nil) -> String? {
        guard let outcome else { return nil }
        if let read = outcome.read, let source = outcome.source, let verdict {
            let name: String = if case let .string(n)? = read["itemName"], !n.isEmpty { n } else { "This item" }
            return "\(name): \(verdict.headline). " + (source == .onDevice ? "Read on this iPhone." : "Read in the cloud.")
        }
        if outcome.route == .blocked {
            return consent == false ? "You chose to keep everything on this iPhone, and this iPhone does not read photos yet."
                                    : "Checking a photo needs the cloud, and the cloud is not allowed yet."
        }
        if outcome.failure == .notSignedIn { return "Not signed in yet. Check the network and try again." }
        return "That item could not be read. Try another photo."
    }
}
