import BYTCore
import FirebaseAppCheck
import FirebaseCore
import Foundation
import ImageIO
import SwiftUI
import Testing
import UIKit
@testable import BYT

/// Opt-in, never part of the checks: one cloud second look on a real iPhone, through the app's own
/// readPhoto. Build it in the Release configuration (with ENABLE_TESTABILITY=YES), where App Check has
/// only App Attest and Firebase is live, and run it on the phone with TEST_RUNNER_BYT_LIVE_CLOUD=1.
/// The photo is test-fed (the public, blurred own-01 power bank label), read first by Apple's model on
/// the phone. The box is kept in memory, so the box saved on the phone is never read or changed. Cloud
/// checks are allowed through the app's own answer to the cloud question. The test waits for the second
/// look, prints each model call, the counters and the second-look note, and writes the box and a picture
/// of its screen to this app's tmp/row20 folder.
@MainActor
@Suite(.enabled(if: ProcessInfo.processInfo.environment["BYT_LIVE_CLOUD"] == "1"))
struct LiveCloudLookTests {
    @Test func aPhotoReadOnThePhoneGetsARealCloudSecondLook() async throws {
        #if DEBUG
        Issue.record("Build this test in the Release configuration, so App Check uses App Attest.")
        #endif
        let app = try #require(FirebaseApp.app(), "Firebase was not configured by the app")
        let provider = BYTAppCheckFactory().createProvider(with: app)
        print("ROW20 provider=\(provider.map { String(describing: type(of: $0)) } ?? "none")")
        #expect(provider is AppAttestProvider)

        let status = ModelSessionFactory.onDeviceStatus()
        try #require(status.readsPhotos, "this phone's model does not read photos")
        let url = try #require(Bundle(for: Marker.self).url(forResource: "own-01", withExtension: "jpg"), "own-01.jpg is not in the test bundle")
        let data = try Data(contentsOf: url)
        let source = try #require(CGImageSourceCreateWithData(data as CFData, nil))
        let crop = try Crop.jpeg(try #require(CGImageSourceCreateImageAtIndex(source, 0, nil)))

        // The app's own reader (makeReader: sign-in, the pause switch, the cloud runner with limited-use App
        // Check tokens, the engine's parser), with each model call written down on its way through.
        let engine = try RulesEngine()
        try engine.setEdition(try #require(AppModel.shippedEdition()))
        let calls = CallLog()
        let signIn = SignIn.firebase()
        var reader = AppModel.makeReader(engine: engine, signIn: signIn, pause: PauseSwitch())
        let device = reader.device
        reader.device = Logged(path: "on_device", model: ItemReader.deviceModelName, inner: device, log: calls)
        let makeCloud = reader.makeCloud
        reader.makeCloud = { model in Logged(path: "in_cloud", model: model, inner: makeCloud(model), log: calls) }

        let persistence = MemoryBoxPersistence()
        let model = AppModel(signIn: signIn, onDeviceStatus: { status }, persistence: persistence, reader: reader, config: .defaults)
        model.network.pathChanged(satisfied: true)
        await model.answerConsent(true)
        let started = Date()
        await model.readPhoto(crop)
        await model.waitForSecondLooks()

        let item = model.box?.items.first
        let first = model.lastRead?.records.first
        print("ROW20 started=\(ISO8601DateFormatter().string(from: started)) build=\(Bundle.main.infoDictionary?["CFBundleVersion"] ?? "?")")
        print("ROW20 first read: path=\(first?.path.rawValue ?? "none") model=\(first?.model ?? "none") reason=\(first?.reason.rawValue ?? "none")",
              "route=\(model.lastRead?.route.rawValue ?? "none") ms=\(Int(first?.latencyMs ?? 0)) line=\(model.readLine ?? "nil")")
        for call in calls.all { print("ROW20 call: \(call)") }
        if let s = model.box?.sources {
            print("ROW20 counters: onDevice=\(s.onDevice) inCloud=\(s.inCloud) secondLooks=\(s.secondLooks) cloudFallbacks=\(s.cloudFallbacks)")
        }
        print("ROW20 item: category=\(item?.read["category"].map { "\($0)" } ?? "nil") readSource=\(item?.readSource ?? "nil")",
              "secondLook=\(item?.secondLook.map { "\(Int($0.ms)) ms, \($0.reason)" } ?? "none")",
              "lookError=\(item.flatMap { model.secondLookError($0.itemId) } ?? "none")")

        try save(model: model, persistence: persistence)
        #expect(first?.path == .onDevice)
        #expect(calls.all.contains { $0.hasPrefix("in_cloud ") && $0.contains(" ok ") })
        #expect(model.box?.sources.secondLooks == 1)
        #expect(item?.secondLook != nil)
    }

    /// The box as saved, and a picture of the box screen drawn on this phone, in tmp/row20.
    private func save(model: AppModel, persistence: MemoryBoxPersistence) throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("row20", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        if let snapshot = persistence.stored {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(snapshot).write(to: folder.appendingPathComponent("box.json"))
        }
        guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap(\.windows).first else {
            print("ROW20 no window for the picture")
            return
        }
        let host = UIHostingController(rootView: NavigationStack { BoxView(model: model) })
        let before = window.rootViewController
        window.rootViewController = host
        window.makeKeyAndVisible()
        RunLoop.main.run(until: Date().addingTimeInterval(2))
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        try image.pngData()?.write(to: folder.appendingPathComponent("box-screen.png"))
        window.rootViewController = before
        print("ROW20 wrote \(folder.path)")
    }
}

private final class Marker {}

/// Each model call: which path, which model, ok or the failure, its time and tokens.
private final class CallLog: @unchecked Sendable {
    private let lock = NSLock()
    private var calls: [String] = []
    func add(_ call: String) { lock.lock(); calls.append(call); lock.unlock() }
    var all: [String] { lock.lock(); defer { lock.unlock() }; return calls }
}

private struct Logged: ItemModelRunner {
    let path: String
    let model: String
    let inner: any ItemModelRunner
    let log: CallLog

    func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
        await timed { await inner.read(input) }
    }

    func read(_ input: ItemInput, stillWanted: @escaping @Sendable @MainActor () -> Bool) async -> Result<ItemReply, ReadError> {
        await timed { await inner.read(input, stillWanted: stillWanted) }
    }

    private func timed(_ call: () async -> Result<ItemReply, ReadError>) async -> Result<ItemReply, ReadError> {
        let start = Date()
        let result = await call()
        let ms = Int(Date().timeIntervalSince(start) * 1000)
        let at = ISO8601DateFormatter().string(from: start)
        switch result {
        case let .success(reply):
            log.add("\(path) \(model) ok \(ms) ms at \(at) tokens=\(reply.tokens.map { "\($0.input)/\($0.output)" } ?? "none")")
        case let .failure(error):
            log.add("\(path) \(model) failed \(error.failure.rawValue) \(ms) ms at \(at)")
        }
        return result
    }
}
