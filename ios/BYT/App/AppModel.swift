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

    init(signIn: SignIn = .firebase(), onDevice: OnDeviceStatus = ModelSessionFactory.onDeviceStatus(),
         persistence: BoxPersistence = BoxFiles()) {
        self.signIn = signIn
        self.onDevice = onDevice
        let engine = try? RulesEngine()
        if let engine, let url = Bundle.main.url(forResource: "edition", withExtension: "json"),
           let text = try? String(contentsOf: url, encoding: .utf8) {
            _ = try? engine.setEdition(text)
        }
        self.engine = engine
        self.reader = engine.map { Self.makeReader(engine: $0, signIn: signIn) }
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
        signedIn = await signIn.ensure()
        onDevice = ModelSessionFactory.onDeviceStatus()
    }
}
