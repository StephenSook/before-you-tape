import BYTCore
import Foundation
import ImageIO
import Testing
@testable import BYT

/// Opt-in, never part of the checks: reads real label photos with this machine's own Apple
/// on-device model, through the app's own reader, the engine's parser and the rules, offline. It
/// runs only with BYT_LIVE_MODEL=1 (pass TEST_RUNNER_BYT_LIVE_MODEL=1 to xcodebuild), so no check
/// depends on a model being present. Each read prints its route, time, tokens and screen line.
@MainActor
@Suite(.enabled(if: ProcessInfo.processInfo.environment["BYT_LIVE_MODEL"] == "1"))
struct LiveModelTests {
    @Test(arguments: ["own-18", "own-25", "i01"])
    func aLabelPhotoIsReadOnThisMachinesModelOffline(_ id: String) async throws {
        let status = ModelSessionFactory.onDeviceStatus()
        try #require(status.readsPhotos, "this machine's model does not read photos")
        let data = try Data(contentsOf: BoxStoreTests.repo.appendingPathComponent("public/eval/items/\(id).jpg"))
        let source = try #require(CGImageSourceCreateWithData(data as CFData, nil))
        let crop = try Crop.jpeg(try #require(CGImageSourceCreateImageAtIndex(source, 0, nil)))
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), onDeviceStatus: { status },
                             persistence: MemoryBoxPersistence(), config: .defaults)
        model.network.pathChanged(satisfied: false)
        await model.readPhoto(crop)
        let record = model.lastRead?.records.last
        print("LIVE \(id): path=\(record?.path.rawValue ?? "none") failure=\(model.lastRead?.failure?.rawValue ?? "none")",
              "ms=\(Int(record?.latencyMs ?? 0)) tokens=\(record?.inputTokens ?? -1)/\(record?.outputTokens ?? -1)",
              "crop=\(crop.count)B line=\(model.readLine ?? "nil")")
        #expect(model.lastRead?.source == .onDevice && model.box?.items.first?.readSource == "phone_on_device")
    }
}
