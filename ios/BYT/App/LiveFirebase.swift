import Foundation
import os

/// Whether this launch may call Firebase over the network: the anonymous sign-in, Remote Config and
/// Firestore (and so, behind the sign-in, the cloud model). Release builds always may. A Debug build
/// may only when launched with `-liveFirebase` and not hosted by XCTest, so tests and local runs
/// never reach the live project, its data or its App Check enforcement.
struct LiveFirebase: Sendable {
    let allowed: Bool

    /// The launch argument that lets a Debug build call the live project.
    static let optIn = "-liveFirebase"

    static func decide(debug: Bool, arguments: [String], hostedByXCTest: Bool) -> Bool {
        guard debug else { return true }
        return arguments.contains(optIn) && !hostedByXCTest
    }

    /// True when XCTest runs inside this process: a unit test launch hosted by the app.
    static func hostedByXCTest(environment: [String: String]) -> Bool {
        ["XCTestConfigurationFilePath", "XCTestBundlePath", "XCTestSessionIdentifier"].contains { environment[$0] != nil }
            || NSClassFromString("XCTestCase") != nil
    }

    static let thisLaunch: LiveFirebase = {
        #if DEBUG
        let process = ProcessInfo.processInfo
        return LiveFirebase(allowed: decide(debug: true, arguments: process.arguments,
                                            hostedByXCTest: hostedByXCTest(environment: process.environment)))
        #else
        return LiveFirebase(allowed: true)
        #endif
    }()

    /// Runs a network call when this launch may; otherwise says in the log that it was skipped and
    /// gives the offline answer without running it.
    func call<T>(_ what: String, offline: T, isolation: isolated (any Actor)? = #isolation,
                 _ live: () async -> T) async -> T {
        guard allowed else {
            skip(what)
            return offline
        }
        return await live()
    }

    /// Says in the log that a call was skipped, and keeps its name for a test to check.
    func skip(_ what: String) {
        Self.skipped.add(what)
        Self.log.notice("Skipped \(what, privacy: .public): Firebase network calls are off in this Debug or test launch. Launch with -liveFirebase to turn them on.")
    }

    private static let log = Logger(subsystem: "app.beforeyoutape.reader", category: "firebase")

    /// Every call skipped in this process, by name.
    static let skipped = Skipped()

    final class Skipped: @unchecked Sendable {
        private let lock = NSLock()
        private var names: [String] = []
        func add(_ name: String) { lock.lock(); names.append(name); lock.unlock() }
        func contains(_ name: String) -> Bool { lock.lock(); defer { lock.unlock() }; return names.contains(name) }
    }
}
