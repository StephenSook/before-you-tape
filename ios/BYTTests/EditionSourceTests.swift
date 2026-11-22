import BYTCore
import Foundation
import Testing
@testable import BYT

/// Which rule edition the box uses (the web app's src/data/editionSource.ts).
@MainActor
@Suite struct EditionSourceTests {
    static func bundled() throws -> String { try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8) }

    /// A newer edition made from the bundled one, with its own id and a later revision (`by` revisions
    /// after the bundled one; 0 or less is the same or an older one), and its SHA-256 as the web computes it.
    /// A nil step leaves the revision out.
    static func newer(id: String = "byt-newer-test", by step: Int? = 1) throws -> (text: String, sha: String) {
        var json = try JSONSerialization.jsonObject(with: Data(bundled().utf8)) as! [String: Any]
        json["editionId"] = id
        if let step { json["revision"] = (json["revision"] as! Int) + step } else { json.removeValue(forKey: "revision") }
        let text = String(decoding: try JSONSerialization.data(withJSONObject: json), as: UTF8.self)
        let probe = try RulesEngine()
        _ = try probe.setEdition(text)
        return (text, EditionSource.sha256Hex(try probe.canonicalEdition()))
    }

    final class Fetches: @unchecked Sendable { var ids: [String] = [] }

    /// Choosing only checks: it returns the edition text to install and never changes an engine.
    func choose(_ wantId: String, _ wantSha: String, remote: String?, active: String? = nil) async throws -> (EditionSource.Choice, Fetches) {
        let fetches = Fetches()
        let choice = await EditionSource.choose(bundledText: try Self.bundled(), activeText: active, wantId: wantId, wantSha: wantSha) { id in
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

    /// A pin that is not newer than this build's edition (the usual state while the pin serves builds made
    /// before this one) keeps the built-in edition and says nothing: rules a later edition fixed never come back.
    @Test func aPinNotNewerThanTheBuiltInEditionKeepsItWithNoNotice() async throws {
        // An older revision (revision 6 under a revision 7 build), the same one, and none at all (counts as 0).
        for step in [-1, 0, nil] {
            let pin = try Self.newer(id: "byt-pinned", by: step)
            let (c, fetches) = try await choose("byt-pinned", pin.sha, remote: pin.text)
            #expect(c == EditionSource.Choice(from: "bundled", notice: nil, text: try Self.bundled()), "\(String(describing: step))")
            #expect(fetches.ids == ["byt-pinned"])
        }
    }

    /// A pin naming the edition in use (here the built-in one, with another hash) keeps it, unfetched.
    @Test func aPinNamingTheEditionInUseKeepsItWithoutFetching() async throws {
        let built = try #require(EditionSource.identity(of: try Self.bundled()))
        let (c, fetches) = try await choose(built.id, String(repeating: "0", count: 64), remote: nil)
        #expect(c == EditionSource.Choice(from: "bundled", notice: nil, text: try Self.bundled()) && fetches.ids.isEmpty)
    }

    /// A newer edition already in use stays: a pin older than it is kept out and says so, a pin naming it is
    /// not fetched again, and a still newer pin replaces it. Naming the built-in edition goes back to it.
    @Test func theEditionInUseIsReplacedOnlyByANewerPin() async throws {
        let inUse = try Self.newer(id: "byt-in-use", by: 2)
        let older = try Self.newer(id: "byt-older", by: 1)
        let (kept, _) = try await choose("byt-older", older.sha, remote: older.text, active: inUse.text)
        #expect(kept == EditionSource.Choice(from: "remote", notice: EditionSource.olderThanInUse, text: inUse.text))
        #expect(EditionSource.olderThanInUse == "The pinned rule edition is older than the one in use. Keeping the one in use.")
        let (same, fetches) = try await choose("byt-in-use", inUse.sha, remote: nil, active: inUse.text)
        #expect(same == EditionSource.Choice(from: "remote", notice: nil, text: inUse.text) && fetches.ids.isEmpty)
        let still = try Self.newer(id: "byt-still-newer", by: 3)
        #expect(try await choose("byt-still-newer", still.sha, remote: still.text, active: inUse.text).0
            == EditionSource.Choice(from: "remote", notice: nil, text: still.text))
        let built = try #require(EditionSource.identity(of: try Self.bundled()))
        #expect(try await choose(built.id, built.sha, remote: nil, active: inUse.text).0
            == EditionSource.Choice(from: "bundled", notice: nil, text: try Self.bundled()))
        // A failed pin keeps the edition in use, not the built-in one.
        #expect(try await choose("byt-gone", still.sha, remote: nil, active: inUse.text).0
            == EditionSource.Choice(from: "remote", notice: EditionSource.notLoaded, text: inUse.text))
    }
}
