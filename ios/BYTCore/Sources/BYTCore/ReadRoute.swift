import Foundation

/// Where one read ran.
public enum ReadPath: String, Codable, Sendable { case onDevice = "on_device", cloud = "in_cloud" }
/// The read's route, in the web app's words (src/ai/port.ts).
public enum ReadRoute: String, Codable, Sendable { case hybrid, deviceOnly = "device_only", cloudOnly = "cloud_only", blocked }
/// What the model reads: a photo of the label, or the label's words.
public enum ReadInputKind: String, Codable, Sendable { case photo, labelWords = "label_words" }

public enum RouteReason: String, Codable, Sendable, CaseIterable {
    case onDeviceDefault = "on_device_default", noNetwork = "no_network", consentDeclined = "consent_declined",
         cloudPaused = "cloud_paused", onDeviceUnavailable = "on_device_unavailable", noImageInput = "no_image_input",
         localeUnsupported = "locale_unsupported", nothingAllowed = "nothing_allowed"
}

public struct RouteInput: Codable, Equatable, Sendable {
    public var kind: ReadInputKind
    public var onDeviceAvailable: Bool
    /// Whether the on-device model takes an image (photo reads only).
    public var imageInput: Bool
    public var localeSupported: Bool
    public var online: Bool
    /// nil: the sender has not answered, which counts as not given.
    public var cloudConsent: Bool?
    public var killCloud: Bool

    public init(kind: ReadInputKind, onDeviceAvailable: Bool, imageInput: Bool, localeSupported: Bool, online: Bool,
                cloudConsent: Bool?, killCloud: Bool) {
        self.kind = kind
        self.onDeviceAvailable = onDeviceAvailable
        self.imageInput = imageInput
        self.localeSupported = localeSupported
        self.online = online
        self.cloudConsent = cloudConsent
        self.killCloud = killCloud
    }
}

public struct RouteDecision: Codable, Equatable, Sendable {
    public var route: ReadRoute
    public var first: ReadPath?
    public var reason: RouteReason
    public init(route: ReadRoute, first: ReadPath?, reason: RouteReason) {
        self.route = route
        self.first = first
        self.reason = reason
    }
}

public enum ReadFailure: String, Codable, Sendable, CaseIterable, Error {
    case guardrailBlock = "guardrail_block", refusal, parseFailed = "parse_failed", unavailable,
         contextExceeded = "context_exceeded", timeout, network, appCheckRefused = "app_check_refused",
         rateLimited = "rate_limited", server, cancelled, other,
         /// The anonymous sign-in failed, so no cloud call was made (AI Logic serves signed-in users only).
         notSignedIn = "not_signed_in",
         /// The cloud was paused (Remote Config `kill_cloud`) before the next cloud call, so none was made.
         cloudPaused = "cloud_paused"
}

public enum NextStep: Equatable, Sendable { case retryInCloud, retryCloudOnce, typedEntry }

/// The web app's rule (src/routing/policy.ts): consent must be a yes, the cloud not paused, and
/// the phone online. Consent that was never answered counts as not given.
public func cloudAllowed(consent: Bool?, online: Bool, killCloud: Bool) -> Bool {
    consent == true && !killCloud && online
}

/// The iPhone form of the read route. Code picks the path; a model never does.
public enum ReadRoutePolicy {
    public static func decide(_ i: RouteInput) -> RouteDecision {
        let ready = i.onDeviceAvailable && i.localeSupported && (i.kind == .labelWords || i.imageInput)
        let allowed = cloudAllowed(consent: i.cloudConsent, online: i.online, killCloud: i.killCloud)
        switch (ready, allowed) {
        case (true, true):
            return RouteDecision(route: .hybrid, first: .onDevice, reason: .onDeviceDefault)
        case (true, false):
            let why: RouteReason = !i.online ? .noNetwork : i.killCloud ? .cloudPaused : .consentDeclined
            return RouteDecision(route: .deviceOnly, first: .onDevice, reason: why)
        case (false, true):
            let why: RouteReason = !i.onDeviceAvailable ? .onDeviceUnavailable
                : !i.localeSupported ? .localeUnsupported : .noImageInput
            return RouteDecision(route: .cloudOnly, first: .cloud, reason: why)
        case (false, false):
            return RouteDecision(route: .blocked, first: nil, reason: .nothingAllowed)
        }
    }

    /// After a failed read. A guardrail block or a refusal never leads to the cloud: sending the
    /// blocked item elsewhere would go around the guardrail. A cancelled read never retries.
    public static func afterFailure(_ f: ReadFailure, route: ReadRoute, ran: ReadPath, cloudRetries: Int) -> NextStep {
        switch f {
        case .guardrailBlock, .refusal, .cancelled, .appCheckRefused, .notSignedIn, .cloudPaused, .other:
            return .typedEntry
        case .unavailable, .contextExceeded, .parseFailed, .timeout:
            return ran == .onDevice && route == .hybrid ? .retryInCloud : .typedEntry
        case .network, .rateLimited, .server:
            return ran == .cloud && cloudRetries < 1 ? .retryCloudOnce : .typedEntry
        }
    }
}

public enum BlockKind: String, Codable, Sendable { case guardrail, refusal }

/// What one read records about itself: never the label text or the photo.
public struct RouteRecord: Codable, Equatable, Sendable {
    public let platform: String
    public var kind: ReadInputKind
    public var path: ReadPath
    public var model: String
    public var reason: RouteReason
    public var latencyMs: Double
    public let sdkReported: Bool
    public var blocked: BlockKind?
    public var inputTokens: Int?
    public var outputTokens: Int?

    public init(kind: ReadInputKind, path: ReadPath, model: String, reason: RouteReason, latencyMs: Double, blocked: BlockKind?,
                inputTokens: Int? = nil, outputTokens: Int? = nil) {
        self.platform = "ios"
        self.kind = kind
        self.path = path
        self.model = model
        self.reason = reason
        self.latencyMs = latencyMs
        self.sdkReported = false
        self.blocked = blocked
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
    }

    enum CodingKeys: String, CodingKey { case platform, kind, path, model, reason, latencyMs, sdkReported, blocked, inputTokens, outputTokens }

    /// `blocked` is written as null when there was no block.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(platform, forKey: .platform)
        try c.encode(kind, forKey: .kind)
        try c.encode(path, forKey: .path)
        try c.encode(model, forKey: .model)
        try c.encode(reason, forKey: .reason)
        try c.encode(latencyMs, forKey: .latencyMs)
        try c.encode(sdkReported, forKey: .sdkReported)
        try c.encode(blocked, forKey: .blocked)
        try c.encodeIfPresent(inputTokens, forKey: .inputTokens)
        try c.encodeIfPresent(outputTokens, forKey: .outputTokens)
    }
}
