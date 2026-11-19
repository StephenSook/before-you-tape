import AVFoundation
import PhotosUI
import SwiftUI

enum CaptureSource: String, Sendable { case camera, upload }

/// The camera with the hold zone drawn on it, a "Check now" shutter, and "Add a photo" for the
/// photo library (and for the simulator, which has no camera). Hands back the crop's JPEG.
struct CaptureView: View {
    let camera: CameraSession
    var onImage: (Data, CaptureSource) async -> Void

    @State private var state: CameraState = .starting
    @State private var picked: PhotosPickerItem?
    @State private var working = false
    @State private var problem: String?

    /// The web app's lines for a camera that cannot be used (src/ui/CameraStage.tsx).
    static func cameraLine(_ state: CameraState) -> String? {
        switch state {
        case .denied: "Camera is off. Add a photo instead."
        case .unavailable: "No camera found. Add a photo instead."
        case .starting, .ready: nil
        }
    }

    var body: some View {
        VStack(spacing: 16) {
            if state == .ready {
                ZStack {
                    CameraPreview(session: camera.session)
                    GeometryReader { g in
                        let z = HoldZone.standard
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(.white, lineWidth: 3)
                            .frame(width: g.size.width * z.width, height: g.size.height * z.height)
                            .position(x: g.size.width * z.midX, y: g.size.height * z.midY)
                    }
                }
                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                .accessibilityElement()
                .accessibilityLabel("Camera view")
                Text("Hold the label inside the frame.").font(.title3)
                Button("Check now") { Task { await shoot() } }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            } else if let line = Self.cameraLine(state) {
                Text(line).font(.title3).multilineTextAlignment(.center)
            }
            PhotosPicker("Add a photo", selection: $picked, matching: .images)
                .buttonStyle(.bordered)
                .controlSize(.large)
            if let problem { Text(problem).font(.title3).multilineTextAlignment(.center) }
        }
        .padding()
        .disabled(working)
        .task { state = await camera.start() }
        .onDisappear { camera.stop() }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task { await usePicked(item) }
        }
    }

    private func shoot() async {
        await run(.camera) {
            let frame = try await camera.capture()
            return try await Task.detached { try Crop.jpeg(Crop.holdZone(of: frame.image, zone: HoldZone.standard, orientation: frame.orientation)) }.value
        }
    }

    private func usePicked(_ item: PhotosPickerItem) async {
        await run(.upload) {
            guard let data = try await item.loadTransferable(type: Data.self) else { throw CropError.notDrawable }
            return try await Task.detached { try PhotoPick.jpeg(fromFile: data) }.value
        }
        picked = nil
    }

    private func run(_ source: CaptureSource, _ make: () async throws -> Data) async {
        working = true
        problem = nil
        defer { working = false }
        do {
            await onImage(try await make(), source)
        } catch {
            problem = "That photo could not be used. Try again, or add another photo."
        }
    }
}

/// The live camera picture, letterboxed so the whole photo frame is visible under the hold zone.
private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspect
        return v
    }

    func updateUIView(_ v: PreviewView, context: Context) {
        if let c = v.previewLayer.connection, c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
    }
}
