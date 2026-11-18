import Foundation

/// The only things a cloud read may carry: the hold-zone crop and the fixed prompt, or the label
/// words and their prompt. Never the whole frame, never anything about the sender.
public struct CloudOutbound: Equatable, Sendable {
    public let prompt: String
    public let imageJPEG: Data?
    public let words: String?

    public init(prompt: String, imageJPEG: Data?, words: String?) {
        self.prompt = prompt
        self.imageJPEG = imageJPEG
        self.words = words
    }

    public static func photo(crop: Data, prompt: String) -> CloudOutbound { CloudOutbound(prompt: prompt, imageJPEG: crop, words: nil) }
    public static func words(_ words: String, prompt: String) -> CloudOutbound { CloudOutbound(prompt: prompt, imageJPEG: nil, words: words) }
}

/// Firebase AI Logic's cloud errors as read failures. App Check refusals (401 and 403) go to typed
/// entry; a rate limit and server errors may retry once.
public enum CloudFailure {
    public enum Kind: Sendable { case serviceUnavailable, networkFailure, modelNotFound, apiError, invalidResponse }

    public static func classify(_ kind: Kind, statusCode: Int?) -> ReadFailure {
        switch kind {
        case .apiError:
            switch statusCode {
            case 401?, 403?: return .appCheckRefused
            case 429?: return .rateLimited
            case let code? where (500...599).contains(code): return .server
            default: return .other
            }
        case .serviceUnavailable: return .server
        case .networkFailure: return .network
        case .invalidResponse: return .parseFailed
        case .modelNotFound: return .other
        }
    }
}
