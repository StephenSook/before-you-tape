import BYTCore
import FirebaseAILogic
import Foundation
import FoundationModels
import ImageIO

/// The only file that names Apple's session API (the iOS guard enforces it). BYTCore's router
/// decides the path; this file runs what was decided.
enum ModelSessionFactory {
    static func onDeviceStatus() -> OnDeviceStatus {
        let model = SystemLanguageModel.default
        var unavailable: OnDeviceStatus.Unavailable?
        switch model.availability {
        case .available: unavailable = nil
        case let .unavailable(reason):
            switch reason {
            case .deviceNotEligible: unavailable = .deviceNotEligible
            case .appleIntelligenceNotEnabled: unavailable = .appleIntelligenceOff
            case .modelNotReady: unavailable = .modelNotReady
            @unknown default: unavailable = .other
            }
        }
        return OnDeviceStatus(unavailable: unavailable, localeSupported: model.supportsLocale(),
                              contextSize: model.contextSize, variant: "Apple on-device model",
                              vision: model.capabilities.contains(.vision))
    }

    /// Loads the on-device model before the first read.
    static func prewarm() {
        LanguageModelSession(model: SystemLanguageModel.default, instructions: Prompts.itemReadSystem).prewarm()
    }

    /// Maps a thrown model error to the read failure the router understands.
    static func failure(from error: any Error) -> ReadFailure {
        switch error {
        case let e as LanguageModelError:
            switch e {
            case .guardrailViolation: return .guardrailBlock
            case .refusal: return .refusal
            case .contextSizeExceeded: return .contextExceeded
            case .unsupportedLanguageOrLocale: return .unavailable
            case .timeout: return .timeout
            case .rateLimited: return .rateLimited
            case .unsupportedCapability, .unsupportedTranscriptContent, .unsupportedGenerationGuide: return .other
            @unknown default: return .other
            }
        case let e as SystemLanguageModel.Error:
            if case .assetsUnavailable = e { return .unavailable }
            return .other
        case let e as GeminiLanguageModel.Error:
            switch e {
            case .serviceUnavailable: return CloudFailure.classify(.serviceUnavailable, statusCode: 503)
            case .networkFailure: return CloudFailure.classify(.networkFailure, statusCode: nil)
            case .modelNotFound: return CloudFailure.classify(.modelNotFound, statusCode: 404)
            case let .apiError(api): return CloudFailure.classify(.apiError, statusCode: api.statusCode)
            case .invalidResponse: return CloudFailure.classify(.invalidResponse, statusCode: nil)
            @unknown default: return .other
            }
        case is CancellationError:
            return .cancelled
        case is URLError:
            return .network
        case is DecodingError, is GeneratedContent.ParsingError:
            return .parseFailed
        default:
            return .other
        }
    }

    /// Whether a cloud error gets one try on the fallback model, by the web app's rule.
    static func fallbackAfter(from error: any Error) -> FallbackAfter? {
        guard let e = error as? GeminiLanguageModel.Error else { return nil }
        switch e {
        case let .serviceUnavailable(x): return CloudFailure.fallbackAfter(statusCode: 503, message: x.debugDescription)
        case let .modelNotFound(x): return CloudFailure.fallbackAfter(statusCode: 404, message: x.debugDescription)
        case let .apiError(api): return CloudFailure.fallbackAfter(statusCode: api.statusCode, message: api.message)
        case let .networkFailure(x):
            return CloudFailure.fallbackAfter(statusCode: CloudFailure.httpStatus(inNetworkFailure: x.debugDescription), message: x.debugDescription)
        case .invalidResponse: return nil
        @unknown default: return nil
        }
    }

    static func readError(from error: any Error) -> ReadError {
        ReadError(failure(from: error), fallbackAfter: fallbackAfter(from: error))
    }

    /// One new session per read, so history never grows. The photo goes in as an attachment.
    fileprivate static func respond(_ session: LanguageModelSession, photo: Data?, prompt: String) async -> Result<ItemReply, ReadError> {
        do {
            let response: LanguageModelSession.Response<ItemReadG>
            if let photo {
                guard let source = CGImageSourceCreateWithData(photo as CFData, nil),
                      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return .failure(ReadError(.other)) }
                response = try await session.respond(generating: ItemReadG.self) {
                    prompt
                    Attachment(image)
                }
            } else {
                response = try await session.respond(to: prompt, generating: ItemReadG.self)
            }
            let tokens = TokenUse(input: response.usage.input.totalTokenCount, output: response.usage.output.totalTokenCount)
            return .success(ItemReply(read: response.content.read, tokens: tokens))
        } catch {
            return .failure(readError(from: error))
        }
    }
}

/// Apple's on-device model. It holds nothing, so it can never reach the cloud.
struct DeviceRunner: ItemModelRunner {
    func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
        switch input {
        case let .photo(crop):
            let session = LanguageModelSession(model: SystemLanguageModel.default, instructions: Prompts.itemReadSystem)
            return await ModelSessionFactory.respond(session, photo: crop, prompt: Prompts.itemReadPhoto)
        case let .words(words):
            let session = LanguageModelSession(model: SystemLanguageModel.default, instructions: Prompts.itemReadWordsSystem)
            return await ModelSessionFactory.respond(session, photo: nil, prompt: Prompts.itemReadWords(words))
        }
    }
}

/// Gemini through Firebase AI Logic. It sends only what `CloudOutbound` holds.
struct CloudRunner: ItemModelRunner, @unchecked Sendable {
    let ai: FirebaseAI
    let model: String

    func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
        let outbound: CloudOutbound
        let instructions: String
        switch input {
        case let .photo(crop):
            outbound = .photo(crop: crop, prompt: Prompts.itemReadPhoto)
            instructions = Prompts.itemReadSystem
        case let .words(words):
            outbound = .words(words, prompt: Prompts.itemReadWords(words))
            instructions = Prompts.itemReadWordsSystem
        }
        let session = LanguageModelSession(model: ai.geminiLanguageModel(name: model), instructions: instructions)
        return await ModelSessionFactory.respond(session, photo: outbound.imageJPEG, prompt: outbound.prompt)
    }
}
