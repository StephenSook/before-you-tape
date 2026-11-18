import Foundation
import Testing
@testable import BYTCore

@Suite struct CloudAllowedTests {
    @Test func unansweredConsentCountsAsNotGiven() { #expect(!cloudAllowed(consent: nil, online: true, killCloud: false)) }
    @Test func killCloudWinsOverConsent() { #expect(!cloudAllowed(consent: true, online: true, killCloud: true)) }
    @Test func offlineWinsOverConsent() { #expect(!cloudAllowed(consent: true, online: false, killCloud: false)) }
    @Test func consentOnlineAndNotPausedAllows() { #expect(cloudAllowed(consent: true, online: true, killCloud: false)) }
}

@Suite struct ReadRouteTests {
    func input(_ kind: ReadInputKind, ready: Bool, allowed: Bool, image: Bool = true) -> RouteInput {
        RouteInput(kind: kind, onDeviceAvailable: ready, imageInput: image, localeSupported: true, online: allowed,
                   cloudConsent: allowed ? true : nil, killCloud: false)
    }

    @Test func theFourRowsOfTheRouteTable() {
        for kind in [ReadInputKind.photo, .labelWords] {
            #expect(ReadRoutePolicy.decide(input(kind, ready: true, allowed: true)) == RouteDecision(route: .hybrid, first: .onDevice, reason: .onDeviceDefault))
            #expect(ReadRoutePolicy.decide(input(kind, ready: true, allowed: false)).route == .deviceOnly)
            #expect(ReadRoutePolicy.decide(input(kind, ready: false, allowed: true)) == RouteDecision(route: .cloudOnly, first: .cloud, reason: .onDeviceUnavailable))
            #expect(ReadRoutePolicy.decide(input(kind, ready: false, allowed: false)) == RouteDecision(route: .blocked, first: nil, reason: .nothingAllowed))
        }
    }

    @Test func aPhotoWithNoImageInputGoesToTheCloudWhenAllowed() {
        #expect(ReadRoutePolicy.decide(input(.photo, ready: true, allowed: true, image: false)) == RouteDecision(route: .cloudOnly, first: .cloud, reason: .noImageInput))
        #expect(ReadRoutePolicy.decide(input(.labelWords, ready: true, allowed: true, image: false)).route == .hybrid)   // words need no image input
    }

    @Test func deviceOnlySaysWhyTheCloudIsOut() {
        var i = input(.photo, ready: true, allowed: true)
        i.online = false
        #expect(ReadRoutePolicy.decide(i).reason == .noNetwork)
        i.online = true; i.killCloud = true
        #expect(ReadRoutePolicy.decide(i).reason == .cloudPaused)
        i.killCloud = false; i.cloudConsent = false
        #expect(ReadRoutePolicy.decide(i).reason == .consentDeclined)
    }

    @Test func anUnsupportedLanguageIsSaid() {
        var i = input(.labelWords, ready: true, allowed: true)
        i.localeSupported = false
        #expect(ReadRoutePolicy.decide(i) == RouteDecision(route: .cloudOnly, first: .cloud, reason: .localeUnsupported))
    }

    @Test func aGuardrailBlockOrRefusalNeverLeadsToTheCloud() {
        for route in [ReadRoute.hybrid, .deviceOnly, .cloudOnly, .blocked] {
            for f in [ReadFailure.guardrailBlock, .refusal] {
                #expect(ReadRoutePolicy.afterFailure(f, route: route, ran: .onDevice, cloudRetries: 0) == .typedEntry)
            }
        }
    }

    @Test func deviceFailuresRetryInTheCloudOnlyOnTheHybridRoute() {
        for f in [ReadFailure.unavailable, .contextExceeded, .parseFailed, .timeout] {
            #expect(ReadRoutePolicy.afterFailure(f, route: .hybrid, ran: .onDevice, cloudRetries: 0) == .retryInCloud)
            #expect(ReadRoutePolicy.afterFailure(f, route: .deviceOnly, ran: .onDevice, cloudRetries: 0) == .typedEntry)
        }
    }

    @Test func networkRateLimitAndServerRetryTheCloudOnceThenTypedEntry() {
        for f in [ReadFailure.network, .rateLimited, .server] {
            #expect(ReadRoutePolicy.afterFailure(f, route: .cloudOnly, ran: .cloud, cloudRetries: 0) == .retryCloudOnce)
            #expect(ReadRoutePolicy.afterFailure(f, route: .cloudOnly, ran: .cloud, cloudRetries: 1) == .typedEntry)
        }
        #expect(ReadRoutePolicy.afterFailure(.appCheckRefused, route: .cloudOnly, ran: .cloud, cloudRetries: 0) == .typedEntry)
    }

    @Test func aReadThatCouldNotSignInGoesToTypedEntry() {
        // AI Logic serves signed-in users only, so there is nothing to retry until sign-in works.
        for route in [ReadRoute.hybrid, .cloudOnly] {
            #expect(ReadRoutePolicy.afterFailure(.notSignedIn, route: route, ran: .cloud, cloudRetries: 0) == .typedEntry)
        }
        #expect(ReadFailure.notSignedIn.rawValue == "not_signed_in")
    }

    @Test func cancelledNeverRetries() {
        #expect(ReadRoutePolicy.afterFailure(.cancelled, route: .hybrid, ran: .onDevice, cloudRetries: 0) == .typedEntry)
        #expect(ReadRoutePolicy.afterFailure(.cancelled, route: .cloudOnly, ran: .cloud, cloudRetries: 0) == .typedEntry)
    }

    @Test func theRouteRecordEncodesBlockedAsNullWhenThereWasNoBlock() throws {
        let r = RouteRecord(kind: .photo, path: .onDevice, model: "apple", reason: .onDeviceDefault, latencyMs: 12, blocked: nil)
        let json = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(r))
        #expect(json["blocked"] == .null && json["platform"] == .string("ios") && json["sdkReported"] == .bool(false))
        #expect(json["path"] == .string("on_device") && json["kind"] == .string("photo"))
    }
}

@Suite struct TimeoutTests {
    @Test func returnsNilAfterTheLimitAndTheValueBeforeIt() async {
        #expect(await Timeout.run(seconds: 1) { 7 } == 7)
        let late: Int? = await Timeout.run(seconds: 0.1) { try? await Task.sleep(for: .seconds(5)); return 1 }
        #expect(late == nil)
    }
}
