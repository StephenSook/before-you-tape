import BYTCore
import CryptoKit
import Foundation

/// Which rule edition the box uses (the web app's src/data/editionSource.ts). The built-in edition
/// ships with the app; Remote Config can name a newer one by id and SHA-256, and it is used only
/// when the fetched edition has exactly that id and hash and loads. Anything else keeps the
/// built-in edition and says so. Choosing only checks: the caller installs the chosen text, after it
/// knows no newer request has started, so a late answer never replaces the current rules.
enum EditionSource {
    struct Choice: Equatable, Sendable {
        var from: String
        var notice: String?
        /// The edition to install: the checked remote document, or the built-in one.
        var text: String
    }

    static let notLoaded = "A newer rule edition could not be loaded. Using the built-in edition."
    static let failedCheck = "A newer rule edition failed its integrity check. Using the built-in edition."
    static let notRead = "A newer rule edition could not be read. Using the built-in edition."
    static let olderThanInUse = "The pinned rule edition is older than the one in use. Keeping the one in use."

    static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// The edition's id and the SHA-256 of its canonical JSON, as the web app computes it (the
    /// engine's canonical form of a loaded edition equals that of the document it was loaded from).
    static func identity(of text: String) -> (id: String, sha: String)? {
        guard let probe = try? RulesEngine(), let loaded = try? probe.setEdition(text), let canonical = try? probe.canonicalEdition() else {
            return nil
        }
        return (loaded.editionId, sha256Hex(canonical))
    }

    /// An edition document's revision; a document with none counts as revision 0, as on the web.
    static func revision(of text: String) -> Double {
        let json = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
        return (json?["revision"] as? NSNumber)?.doubleValue ?? 0
    }

    /// Picks the edition to use and says where it came from; changes no engine. `activeText` is a checked
    /// remote edition already in use (nil while the built-in one is): a pin never brings back an edition
    /// older than the one in use, and a refused pin keeps the one in use. Clearing the pin, or naming the
    /// built-in edition, is the deliberate way back to it. The web app's chooseEdition, step for step.
    static func choose(bundledText: String, activeText: String? = nil, wantId: String, wantSha: String,
                       fetchRemote: @Sendable (String) async -> String?) async -> Choice {
        let running = activeText ?? bundledText
        func keep(_ notice: String?) -> Choice { Choice(from: activeText == nil ? "bundled" : "remote", notice: notice, text: running) }
        let id = wantId.trimmingCharacters(in: .whitespaces)
        let sha = wantSha.trimmingCharacters(in: .whitespaces).lowercased()
        let builtIn = Choice(from: "bundled", notice: nil, text: bundledText)
        if id.isEmpty { return builtIn }
        let built = identity(of: bundledText)
        if let built, built.id == id, built.sha == sha { return builtIn }
        // A pin naming the edition in use keeps it, unfetched.
        if (activeText == nil ? built?.id : activeText.flatMap(identity(of:))?.id) == id { return keep(nil) }
        // Text that is not JSON counts as not loaded, as the web app's fetcher returns nothing for it.
        guard let text = await fetchRemote(id), let raw = try? JSONSerialization.jsonObject(with: Data(text.utf8)) else { return keep(notLoaded) }
        guard let remote = identity(of: text) else {
            // The engine refused it, so its hash cannot be taken: a wrong id is a failed check, the right id unreadable.
            return keep((raw as? [String: Any])?["editionId"] as? String == id ? notRead : failedCheck)
        }
        guard remote.id == id, remote.sha == sha else { return keep(failedCheck) }
        // A pin that is not newer than the rules in use would bring back rules a later edition fixed. One older
        // than this build's own edition is the usual state (the pin serves builds made before this one), so it
        // says nothing; one older than a newer edition already in use says it is kept.
        if revision(of: text) <= revision(of: running) { return keep(activeText == nil ? nil : olderThanInUse) }
        return Choice(from: "remote", notice: nil, text: text)
    }
}
