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

/// Why a read moved to the fallback model, in the web app's words (src/ai/itemRead.ts).
public enum FallbackAfter: String, Codable, Sendable { case status500 = "500", status503 = "503", status404 = "404" }

extension CloudFailure {
    /// A 404 means the model is gone only when the message says so; any other 404 just fails.
    /// Word for word from the web app's MODEL_GONE list (a test compares them).
    public static let modelGonePhrases = ["no longer available", "is not found for API version", "not supported for generateContent"]

    /// After the retry, an overloaded or failing server (500 or 503), or a model the API says is
    /// gone, gets one try on the fallback model. Nothing else does.
    public static func fallbackAfter(statusCode: Int?, message: String) -> FallbackAfter? {
        switch statusCode {
        case 500?: return .status500
        case 503?: return .status503
        case 404? where modelGonePhrases.contains(where: { message.range(of: $0, options: .caseInsensitive) != nil }):
            return .status404
        default: return nil
        }
    }

    /// The SDK reports an HTTP error that has no JSON body as "Gemini HTTP error (status N): ...".
    public static func httpStatus(inNetworkFailure text: String) -> Int? {
        guard let r = text.range(of: #"\(status (\d{3})\)"#, options: .regularExpression) else { return nil }
        return Int(text[r].dropFirst("(status ".count).prefix(3))
    }
}
