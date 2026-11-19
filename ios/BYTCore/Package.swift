// swift-tools-version: 6.0
import PackageDescription

// The rules engine host for the iPhone client: the web app's own engine, bundled into one
// script, run in JavaScriptCore. Apple platforms only (JavaScriptCore is not on Linux).
let package = Package(
    name: "BYTCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "BYTCore", targets: ["BYTCore"])],
    targets: [
        .target(name: "BYTCore", resources: [.copy("Resources/byt-engine.js"), .copy("Resources/byt-engine.sha256")]),
        .testTarget(name: "BYTCoreTests", dependencies: ["BYTCore"]),
    ]
)
