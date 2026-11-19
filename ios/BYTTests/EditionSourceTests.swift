import BYTCore
import Foundation
import Testing
@testable import BYT

/// Which rule edition the box uses (the web app's src/data/editionSource.ts).
@MainActor
@Suite struct EditionSourceTests {
    static func bundled() throws -> String { try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8) }

    /// A newer edition made from the bundled one, with its own id, and its SHA-256 as the web computes it.
    static func newer(id: String = "byt-newer-test") throws -> (text: String, sha: String) {
        var json = try JSONSerialization.jsonObject(with: Data(bundled().utf8)) as! [String: Any]
        json["editionId"] = id
        let text = String(decoding: try JSONSerialization.data(withJSONObject: json), as: UTF8.self)
        let probe = try RulesEngine()
        _ = try probe.setEdition(text)
        return (text, EditionSource.sha256Hex(try probe.canonicalEdition()))
    }

    final class Fetches: @unchecked Sendable { var ids: [String] = [] }

    /// Choosing only checks: it returns the edition text to install and never changes an engine.
    func choose(_ wantId: String, _ wantSha: String, remote: String?) async throws -> (EditionSource.Choice, Fetches) {
        let fetches = Fetches()
        let choice = await EditionSource.choose(bundledText: try Self.bundled(), wantId: wantId, wantSha: wantSha) { id in
            fetches.ids.append(id)
            return remote
        }
        return (choice, fetches)
    }

    @Test func noPinKeepsTheBuiltInEditionWithoutFetching() async throws {
        let (c, fetches) = try await choose("", "", remote: nil)
        #expect(c == EditionSource.Choice(from: "bundled", notice: nil, text: try Self.bundled()) && fetches.ids.isEmpty)
    }

    @Test func aRemoteEditionIsUsedOnlyWhenItsHashMatches() async throws {
        let n = try Self.newer()
        let (used, fetches) = try await choose("byt-newer-test", n.sha, remote: n.text)
        #expect(used == EditionSource.Choice(from: "remote", notice: nil, text: n.text) && fetches.ids == ["byt-newer-test"])
        let (refused, _) = try await choose("byt-newer-test", String(repeating: "0", count: 64), remote: n.text)
        #expect(refused == EditionSource.Choice(from: "bundled", notice: "A newer rule edition failed its integrity check. Using the built-in edition.",
                                                text: try Self.bundled()))
    }

    @Test func aWrongIdAMissingDocumentOrUnreadableTextKeepsTheBuiltIn() async throws {
        let n = try Self.newer()
        #expect(try await choose("byt-other", n.sha, remote: n.text).0.notice == "A newer rule edition failed its integrity check. Using the built-in edition.")
        #expect(try await choose("byt-newer-test", n.sha, remote: nil).0.notice == "A newer rule edition could not be loaded. Using the built-in edition.")
        // Text that is not JSON counts as not loaded, as the web app's fetcher returns nothing for it.
        #expect(try await choose("byt-newer-test", n.sha, remote: "{not json").0.notice == "A newer rule edition could not be loaded. Using the built-in edition.")
        #expect(try await choose("byt-newer-test", n.sha, remote: #"{"editionId":"byt-newer-test"}"#).0.notice
            == "A newer rule edition could not be read. Using the built-in edition.")
    }
}
