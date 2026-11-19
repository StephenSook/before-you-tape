import AVFoundation
import Foundation
import Testing
@testable import BYT

@Suite struct CameraLineTests {
    @Test func theCameraOffLinesAreTheWebAppsLines() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let stage = try String(contentsOf: root.appendingPathComponent("src/ui/CameraStage.tsx"), encoding: .utf8)
        #expect(CaptureView.cameraLine(.denied) == "Camera is off. Add a photo instead.")
        #expect(CaptureView.cameraLine(.unavailable) == "No camera found. Add a photo instead.")
        for state in [CameraState.denied, .unavailable] { #expect(stage.contains("\"\(CaptureView.cameraLine(state)!)\"")) }
        #expect(CaptureView.cameraLine(.ready) == nil)
    }
}

@Suite struct CameraStepTests {
    /// With no usable camera the app never asks for camera permission; it says so and offers a photo.
    @Test func noCameraNeverAsksForPermission() {
        #expect(CameraSession.firstStep(hasCamera: false, status: .notDetermined) == .noCamera)
        #expect(CameraSession.firstStep(hasCamera: false, status: .authorized) == .noCamera)
        #expect(CameraSession.firstStep(hasCamera: true, status: .notDetermined) == .ask)
        #expect(CameraSession.firstStep(hasCamera: true, status: .denied) == .denied)
        #expect(CameraSession.firstStep(hasCamera: true, status: .restricted) == .denied)
        #expect(CameraSession.firstStep(hasCamera: true, status: .authorized) == .run)
    }
}
