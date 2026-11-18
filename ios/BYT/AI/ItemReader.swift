import BYTCore
import Foundation

/// What a model reads: the hold-zone crop as JPEG, or the label's words.
enum ItemInput: Equatable, Sendable {
    case photo(cropJPEG: Data)
    case words(String)

    var kind: ReadInputKind {
        switch self {
        case .photo: .photo
        case .words: .labelWords
        }
    }
}

struct TokenUse: Equatable, Sendable {
    var input: Int
    var output: Int
}

/// One model answer: the item read as the web app's JSON shape, and what it cost.
struct ItemReply: Equatable, Sendable {
    var read: JSONValue
    var tokens: TokenUse?
}

/// A failed read, and whether the web app's rule gives it one try on the fallback model.
struct ReadError: Error, Equatable, Sendable {
    var failure: ReadFailure
    var fallbackAfter: FallbackAfter?

    init(_ failure: ReadFailure, fallbackAfter: FallbackAfter? = nil) {
        self.failure = failure
        self.fallbackAfter = fallbackAfter
    }
}

/// Runs one read on one path. The on-device and cloud runners live in `ModelSessionFactory`.
protocol ItemModelRunner: Sendable {
    func read(_ input: ItemInput) async -> Result<ItemReply, ReadError>
}

/// Which reads Apple's on-device model takes in this build. Set from the measured iPhone result,
/// not from Remote Config. Until a photo read on the iPhone is measured, photos go to the cloud
/// and label words stay on the iPhone.
enum ClaimTier {
    static let photoOnDevice = false
}

struct ReadSituation: Equatable, Sendable {
    var status: OnDeviceStatus
    var online: Bool
    /// nil: the sender has not answered, which counts as not given.
    var cloudConsent: Bool?
    var config: RemoteConfigValues
}

struct ReadOutcome: Equatable, Sendable {
    var read: JSONValue?
    var source: ReadPath?
    var route: ReadRoute
    var failure: ReadFailure?
    var records: [RouteRecord]
    /// Set when the read moved to the fallback model, and why ("500", "503" or "404").
    var fallbackAfter: FallbackAfter?
}

/// Reads one item by the router's plan. Code picks the path; a model never does. Never throws,
/// and runs one read at a time.
struct ItemReader: Sendable {
    static let deviceModelName = "apple-on-device"

    var device: any ItemModelRunner
    var makeCloud: @Sendable (String) -> any ItemModelRunner
    /// The web app's own parser (the rules engine's parseItemRead); nil means it refused the answer.
    /// Required, so no caller can skip it.
    var parse: @Sendable (JSONValue) -> JSONValue?
    var deviceSeconds: Double = 30
    var cloudSeconds: Double = 45
    private let gate = ReadGate()

    init(device: any ItemModelRunner, makeCloud: @escaping @Sendable (String) -> any ItemModelRunner,
         parse: @escaping @Sendable (JSONValue) -> JSONValue?) {
        self.device = device
        self.makeCloud = makeCloud
        self.parse = parse
    }

    func read(_ input: ItemInput, situation: ReadSituation) async -> ReadOutcome {
        await gate.acquire()
        let outcome = await run(input, situation)
        await gate.release()
        return outcome
    }

    private func run(_ input: ItemInput, _ s: ReadSituation) async -> ReadOutcome {
        let decision = ReadRoutePolicy.decide(RouteInput(
            kind: input.kind, onDeviceAvailable: s.status.unavailable == nil,
            imageInput: ClaimTier.photoOnDevice && s.status.vision, localeSupported: s.status.localeSupported,
            online: s.online, cloudConsent: s.cloudConsent, killCloud: s.config.killCloud))
        guard var path = decision.first else {
            return ReadOutcome(read: nil, source: nil, route: decision.route, failure: nil, records: [])
        }
        var records: [RouteRecord] = []
        var cloudRetries = 0
        var cloudModel = s.config.cloudModelItem
        var cloud: (any ItemModelRunner)?
        let fallback = s.config.cloudModelItemFallback
        var fallbackAfter: FallbackAfter?

        while true {
            let runner: any ItemModelRunner
            let model: String
            let seconds: Double
            switch path {
            case .onDevice:
                (runner, model, seconds) = (device, Self.deviceModelName, deviceSeconds)
            case .cloud:
                let made = cloud ?? makeCloud(cloudModel)
                cloud = made
                (runner, model, seconds) = (made, cloudModel, cloudSeconds)
            }
            let start = ContinuousClock.now
            var result = await Timeout.run(seconds: seconds) { await runner.read(input) } ?? .failure(ReadError(.timeout))
            if case let .success(reply) = result {
                if let checked = parse(reply.read) { result = .success(ItemReply(read: checked, tokens: reply.tokens)) } else { result = .failure(ReadError(.parseFailed)) }
            }
            let elapsed = ContinuousClock.now - start
            let ms = Double(elapsed.components.seconds) * 1000 + Double(elapsed.components.attoseconds) / 1e15

            switch result {
            case let .success(reply):
                records.append(RouteRecord(kind: input.kind, path: path, model: model, reason: decision.reason, latencyMs: ms,
                                           blocked: nil, inputTokens: reply.tokens?.input, outputTokens: reply.tokens?.output))
                return ReadOutcome(read: reply.read, source: path, route: decision.route, failure: nil, records: records,
                                   fallbackAfter: fallbackAfter)
            case let .failure(error):
                let failure = error.failure
                let blocked: BlockKind? = failure == .guardrailBlock ? .guardrail : failure == .refusal ? .refusal : nil
                records.append(RouteRecord(kind: input.kind, path: path, model: model, reason: decision.reason, latencyMs: ms, blocked: blocked))
                switch ReadRoutePolicy.afterFailure(failure, route: decision.route, ran: path, cloudRetries: cloudRetries) {
                case .retryInCloud:
                    path = .cloud
                case .retryCloudOnce:
                    cloudRetries += 1
                case .typedEntry:
                    // As on the web: after the retry, a 500 or 503, or a model the API says is gone,
                    // gets one try on the fallback model, with no retry of its own.
                    if path == .cloud, fallbackAfter == nil, let after = error.fallbackAfter, !fallback.isEmpty, fallback != cloudModel {
                        fallbackAfter = after
                        cloudModel = fallback
                        cloud = nil
                        cloudRetries = 1
                        continue
                    }
                    return ReadOutcome(read: nil, source: nil, route: decision.route, failure: failure, records: records,
                                       fallbackAfter: fallbackAfter)
                }
            }
        }
    }
}

/// One read at a time, first come first served.
actor ReadGate {
    private var busy = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    func acquire() async {
        if !busy {
            busy = true
            return
        }
        await withCheckedContinuation { waiting.append($0) }
    }

    func release() {
        if waiting.isEmpty { busy = false } else { waiting.removeFirst().resume() }
    }
}
