import AVFoundation
import CoreGraphics
import ImageIO

enum CameraState: Equatable, Sendable { case starting, ready, denied, unavailable }

/// One photo from the camera, with the orientation the sender held the phone in.
struct CapturedFrame: @unchecked Sendable {
    let image: CGImage
    let orientation: CGImagePropertyOrientation
}

enum CameraError: Error { case noImage }

/// The back camera. It prefers Apple's virtual multi-lens camera, so the iPhone switches to its
/// close-focus lens by itself when a label is near. All session work runs on one queue.
final class CameraSession: NSObject, @unchecked Sendable {
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "app.beforeyoutape.camera")
    private let lock = NSLock()
    private var configured = false
    private var inFlight: [Int64: PhotoDelegate] = [:]

    func start() async -> CameraState {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else { return .denied }
        default: return .denied
        }
        let types: [AVCaptureDevice.DeviceType] = [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera]
        guard let device = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video, position: .back).devices.first else {
            return .unavailable
        }
        return await withCheckedContinuation { continuation in
            queue.async { [self] in
                continuation.resume(returning: configureAndRun(device))
            }
        }
    }

    private func configureAndRun(_ device: AVCaptureDevice) -> CameraState {
        if !configured {
            guard let input = try? AVCaptureDeviceInput(device: device) else { return .unavailable }
            session.beginConfiguration()
            session.sessionPreset = .photo
            guard session.canAddInput(input), session.canAddOutput(output) else {
                session.commitConfiguration()
                return .unavailable
            }
            session.addInput(input)
            session.addOutput(output)
            session.commitConfiguration()
            configured = true
        }
        if let c = output.connection(with: .video), c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
        if !session.isRunning { session.startRunning() }
        return .ready
    }

    func stop() {
        queue.async { [session] in if session.isRunning { session.stopRunning() } }
    }

    func capture() async throws -> CapturedFrame {
        try await withCheckedThrowingContinuation { continuation in
            let settings = AVCapturePhotoSettings()
            let id = settings.uniqueID
            let delegate = PhotoDelegate { [weak self] result in
                self?.forget(id)
                continuation.resume(with: result)
            }
            lock.lock()
            inFlight[id] = delegate
            lock.unlock()
            output.capturePhoto(with: settings, delegate: delegate)
        }
    }

    private func forget(_ id: Int64) {
        lock.lock()
        inFlight[id] = nil
        lock.unlock()
    }
}

private final class PhotoDelegate: NSObject, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
    let done: (Result<CapturedFrame, any Error>) -> Void
    init(done: @escaping (Result<CapturedFrame, any Error>) -> Void) { self.done = done }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: (any Error)?) {
        if let error { return done(.failure(error)) }
        guard let image = photo.cgImageRepresentation() else { return done(.failure(CameraError.noImage)) }
        let raw = (photo.metadata[kCGImagePropertyOrientation as String] as? NSNumber)?.uint32Value ?? 1
        done(.success(CapturedFrame(image: image, orientation: CGImagePropertyOrientation(rawValue: raw) ?? .up)))
    }
}
