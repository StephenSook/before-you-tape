import Foundation
import Testing
@testable import BYTCore

/// The only things a cloud read may carry: the hold-zone crop and the fixed prompt, or the label
/// words and their prompt. Never the whole frame, never anything else.
@Suite struct CloudOutboundTests {
    @Test func aPhotoCarriesTheCropAndThePromptOnly() {
        let crop = Data([0xFF, 0xD8, 0xFF, 0xD9])
        let o = CloudOutbound.photo(crop: crop, prompt: "Read the item in this photo.")
        #expect(o == CloudOutbound(prompt: "Read the item in this photo.", imageJPEG: crop, words: nil))
        #expect(Mirror(reflecting: o).children.map(\.label) == ["prompt", "imageJPEG", "words"])
    }

    @Test func wordsCarryTheWordsAndThePromptOnly() {
        let o = CloudOutbound.words("EAU DE PARFUM 50 ML", prompt: "Read these label words.")
        #expect(o == CloudOutbound(prompt: "Read these label words.", imageJPEG: nil, words: "EAU DE PARFUM 50 ML"))
    }
}

@Suite struct CloudFailureTests {
    @Test func httpStatusesMapToReadFailures() {
        #expect(CloudFailure.classify(.apiError, statusCode: 401) == .appCheckRefused)
        #expect(CloudFailure.classify(.apiError, statusCode: 403) == .appCheckRefused)
        #expect(CloudFailure.classify(.apiError, statusCode: 429) == .rateLimited)
        #expect(CloudFailure.classify(.apiError, statusCode: 500) == .server)
        #expect(CloudFailure.classify(.apiError, statusCode: 503) == .server)
        #expect(CloudFailure.classify(.apiError, statusCode: 400) == .other)
        #expect(CloudFailure.classify(.apiError, statusCode: nil) == .other)
    }

    @Test func otherKindsMapToTheirFailures() {
        #expect(CloudFailure.classify(.serviceUnavailable, statusCode: nil) == .server)
        #expect(CloudFailure.classify(.networkFailure, statusCode: nil) == .network)
        #expect(CloudFailure.classify(.invalidResponse, statusCode: nil) == .parseFailed)
        #expect(CloudFailure.classify(.modelNotFound, statusCode: 404) == .other)
    }
}

/// Web parity (src/ai/itemRead.ts): after the retry, a 500 or 503 gets one try on the fallback
/// model, and so does a 404 whose message says the model is gone. A plain 404 does not.
@Suite struct FallbackAfterTests {
    @Test func fiveHundredAndFiveOhThreeFallBack() {
        #expect(CloudFailure.fallbackAfter(statusCode: 500, message: "Internal error") == .status500)
        #expect(CloudFailure.fallbackAfter(statusCode: 503, message: "") == .status503)
        #expect(CloudFailure.fallbackAfter(statusCode: 502, message: "") == nil)
        #expect(CloudFailure.fallbackAfter(statusCode: 429, message: "") == nil)
        #expect(CloudFailure.fallbackAfter(statusCode: nil, message: "500") == nil)
    }

    @Test func aFourOhFourFallsBackOnlyWhenTheModelIsGone() {
        #expect(CloudFailure.fallbackAfter(statusCode: 404, message: "models/x is not found for API version v1beta") == .status404)
        #expect(CloudFailure.fallbackAfter(statusCode: 404, message: "This model is NO LONGER AVAILABLE to new users") == .status404)
        #expect(CloudFailure.fallbackAfter(statusCode: 404, message: "models/x is not supported for generateContent") == .status404)
        #expect(CloudFailure.fallbackAfter(statusCode: 404, message: "Requested entity was not found.") == nil)
        #expect(CloudFailure.fallbackAfter(statusCode: 400, message: "is no longer available") == nil)
    }

    @Test func theGonePhrasesAreTheWebAppsList() throws {
        let file = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("src/ai/itemRead.ts")
        let text = try String(contentsOf: file, encoding: .utf8)
        let line = try #require(text.split(separator: "\n").first { $0.hasPrefix("const MODEL_GONE = /") })
        let body = line.dropFirst("const MODEL_GONE = /".count).prefix { $0 != "/" }
        #expect(line.hasSuffix("/i;"))
        #expect(body.split(separator: "|").map(String.init) == CloudFailure.modelGonePhrases)
    }

    @Test func theStatusIsReadFromTheSDKsHTTPErrorText() {
        #expect(CloudFailure.httpStatus(inNetworkFailure: "Gemini HTTP error (status 500): {}") == 500)
        #expect(CloudFailure.httpStatus(inNetworkFailure: "Gemini HTTP error (status 503): busy") == 503)
        #expect(CloudFailure.httpStatus(inNetworkFailure: "The network connection was lost.") == nil)
    }
}
