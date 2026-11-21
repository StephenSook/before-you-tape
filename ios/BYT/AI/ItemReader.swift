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

/// One model answer: the item read as the web app's JSON shape, and what it cost. After the parser,
/// it also carries the tags of its whole label and that label (kept in memory only).
struct ItemReply: Equatable, Sendable {
    var read: JSONValue
    var tokens: TokenUse?
    var labelTags: [String] = []
    var wholeLabel: String?
}

/// A read the engine's parser accepted: label text clipped for showing, the engine's tags for the
/// whole label, and the whole label itself, which stays in memory and is never saved.
struct ParsedRead: Equatable, Sendable {
    var read: JSONValue
    var labelTags: [String] = []
    var wholeLabel: String?
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
    /// The same read, sent only while `stillWanted` answers true right before the send.
    func read(_ input: ItemInput, stillWanted: @escaping @Sendable @MainActor () -> Bool) async -> Result<ItemReply, ReadError>
}

extension ItemModelRunner {
    func read(_ input: ItemInput, stillWanted: @escaping @Sendable @MainActor () -> Bool) async -> Result<ItemReply, ReadError> {
        await read(input)
    }
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
    /// The engine's tags for the read's whole label, and that label; the box saves the tags and never
    /// tags the clipped text the read shows.
    var labelTags: [String] = []
    var wholeLabel: String?
}

/// Reads one item by the router's plan. Code picks the path; a model never does. Never throws,
/// and runs one read at a time.
struct ItemReader: Sendable {
    static let deviceModelName = "apple-on-device"

    var device: any ItemModelRunner
    var makeCloud: @Sendable (String) -> any ItemModelRunner
    /// The web app's own parser (the rules engine's tagged parse); nil means it refused the answer.
    /// Required, so no caller can skip it.
    var parse: @Sendable (JSONValue) -> ParsedRead?
    /// Read again before every cloud call (the first, a retry, the fallback): false when the cloud
    /// was paused since the read began, and then no cloud call is made.
    var cloudOpen: @Sendable @MainActor () -> Bool = { true }
    var deviceSeconds: Double = 30
    var cloudSeconds: Double = 45
    private let gate = ReadGate()
    /// Second looks run one at a time in a lane of their own, so a slow cloud look never holds up a new
    /// photo read on the device.
    private let lookGate = ReadGate()

    init(device: any ItemModelRunner, makeCloud: @escaping @Sendable (String) -> any ItemModelRunner,
         parse: @escaping @Sendable (JSONValue) -> ParsedRead?) {
        self.device = device
        self.makeCloud = makeCloud
        self.parse = parse
    }

    func read(_ input: ItemInput, situation: ReadSituation) async -> ReadOutcome {
        await gate.acquire()
        let outcome = await run(input, situation, ReadRoutePolicy.decide(Self.routeInput(input.kind, situation)))
        await gate.release()
        return outcome
    }

    /// A cloud second look of an input already read on this iPhone (the web app's runSecondLook): the
    /// cloud-only route, with a first read's retry and fallback, and the cloud gate read again before every
    /// call. Whether one should run at all is the caller's to decide (a reason and the cloud allowed now).
    /// It waits only for other second looks, never for a read.
    func secondLook(_ input: ItemInput, situation: ReadSituation) async -> ReadOutcome {
        await lookGate.acquire()
        let outcome = await run(input, situation, RouteDecision(route: .cloudOnly, first: .cloud, reason: .secondLook))
        await lookGate.release()
        return outcome
    }

    /// The router's input for one read in this situation. A photo goes to Apple's model when that
    /// model reports image understanding (iOS 27); otherwise it goes to the cloud, only when allowed.
    static func routeInput(_ kind: ReadInputKind, _ s: ReadSituation) -> RouteInput {
        RouteInput(kind: kind, onDeviceAvailable: s.status.unavailable == nil,
                   imageInput: s.status.vision, localeSupported: s.status.localeSupported,
                   online: s.online, cloudConsent: s.cloudConsent, killCloud: s.config.killCloud)
    }

    /// Whether a read of this kind can run only in the cloud, so the sender must be asked first.
    static func needsCloud(_ kind: ReadInputKind, _ s: ReadSituation) -> Bool {
        var input = routeInput(kind, s)
        input.cloudConsent = true
        input.online = true
        return ReadRoutePolicy.decide(input).first == .cloud
    }

    private func run(_ input: ItemInput, _ s: ReadSituation, _ decision: RouteDecision) async -> ReadOutcome {
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
                guard await cloudOpen() else {
                    return ReadOutcome(read: nil, source: nil, route: decision.route, failure: .cloudPaused, records: records,
                                       fallbackAfter: fallbackAfter)
                }
                let made = cloud ?? makeCloud(cloudModel)
                cloud = made
                (runner, model, seconds) = (made, cloudModel, cloudSeconds)
            }
            let start = ContinuousClock.now
            // A cloud call reads the gate once more right before it sends (after sign-in, say).
            let open = cloudOpen
            let inCloud = path == .cloud
            var result = await Timeout.run(seconds: seconds) {
                inCloud ? await runner.read(input, stillWanted: open) : await runner.read(input)
            } ?? .failure(ReadError(.timeout))
            if case let .success(reply) = result {
                if let checked = parse(reply.read) {
                    result = .success(ItemReply(read: checked.read, tokens: reply.tokens, labelTags: checked.labelTags, wholeLabel: checked.wholeLabel))
                } else {
                    result = .failure(ReadError(.parseFailed))
                }
            }
            let elapsed = ContinuousClock.now - start
            let ms = Double(elapsed.components.seconds) * 1000 + Double(elapsed.components.attoseconds) / 1e15

            switch result {
            case let .success(reply):
                records.append(RouteRecord(kind: input.kind, path: path, model: model, reason: decision.reason, latencyMs: ms,
                                           blocked: nil, inputTokens: reply.tokens?.input, outputTokens: reply.tokens?.output))
                return ReadOutcome(read: reply.read, source: path, route: decision.route, failure: nil, records: records,
                                   fallbackAfter: fallbackAfter, labelTags: reply.labelTags, wholeLabel: reply.wholeLabel)
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

/// Every cloud read waits for the anonymous sign-in first: AI Logic serves signed-in users only.
/// A failed sign-in sends nothing to the cloud. The pause switch is read again after sign-in, and
/// the upload runs as a task the pause cancels: AI Logic waits for its App Check token and then
/// sends through URLSession, which refuses a cancelled task and stops one in flight. A reply that
/// arrives after the pause is not used. Bytes already on the wire cannot be recalled.
struct SignedInCloudRunner: ItemModelRunner {
    let ensureSignedIn: @Sendable @MainActor () async -> Bool
    let pause: PauseSwitch
    let inner: any ItemModelRunner

    func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
        await read(input, stillWanted: { true })
    }

    /// What the caller wants is read again after sign-in, together with the pause, right before the
    /// upload starts: a look whose item was removed, or whose cloud checks were taken back, sends nothing.
    func read(_ input: ItemInput, stillWanted: @escaping @Sendable @MainActor () -> Bool) async -> Result<ItemReply, ReadError> {
        guard await ensureSignedIn() else { return .failure(ReadError(.notSignedIn)) }
        guard !Task.isCancelled else { return .failure(ReadError(.cloudPaused)) }
        let inner = inner
        guard let upload = await pause.startUnlessPaused(allowed: stillWanted, { await inner.read(input) }) else {
            return .failure(ReadError(.cloudPaused))
        }
        // The upload runs apart from this read, so a read that is cancelled (its time limit) cancels it too.
        let result = await withTaskCancellationHandler { await upload.task.value } onCancel: { upload.task.cancel() }
        // The read's own record decides: a reply from a read the pause cancelled is dropped, even
        // when the pause was lifted again before the reply came back.
        if await pause.finished(upload.id) || upload.task.isCancelled { return .failure(ReadError(.cloudPaused)) }
        return result
    }
}

/// The pause switch as last applied, shared by every cloud runner. Turning it on cancels every
/// upload still running.
@MainActor
final class PauseSwitch {
    var paused = RemoteConfigValues.defaults.killCloud {
        didSet {
            guard paused else { return }
            for (id, cancel) in running {
                cancelled.insert(id)
                cancel()
            }
        }
    }
    private var running: [UUID: () -> Void] = [:]
    private var cancelled: Set<UUID> = []

    struct Upload<T: Sendable>: Sendable {
        let id: UUID
        let task: Task<T, Never>
    }

    /// Starts the upload unless paused or no longer `allowed`; nil then. Checking and starting happen
    /// together, so neither can change between them.
    func startUnlessPaused<T: Sendable>(allowed: @MainActor () -> Bool = { true }, _ work: @escaping @Sendable () async -> T) -> Upload<T>? {
        guard !paused, allowed() else { return nil }
        let id = UUID()
        let task = Task.detached { await work() }
        running[id] = { task.cancel() }
        return Upload(id: id, task: task)
    }

    /// Ends the upload's record; true when the pause cancelled it.
    func finished(_ id: UUID) -> Bool {
        running[id] = nil
        return cancelled.remove(id) != nil
    }
}
