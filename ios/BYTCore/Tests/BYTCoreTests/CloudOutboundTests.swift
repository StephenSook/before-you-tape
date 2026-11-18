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
