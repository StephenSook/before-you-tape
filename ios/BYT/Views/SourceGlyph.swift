import SwiftUI

/// Says where an item's read ran, so the sender can see this iPhone doing the work.
struct SourceGlyph: View {
    let source: String

    static func text(_ source: String) -> String {
        switch source {
        case "phone_on_device": "Read on this iPhone"
        case "phone_cloud", "in_cloud": "Read in the cloud"
        case "on_device": "Read on a laptop"
        case "manual": "Typed by you"
        default: "Route not reported"
        }
    }

    var body: some View {
        Label(Self.text(source), systemImage: source == "phone_on_device" ? "iphone" : source == "manual" ? "keyboard" : "cloud")
            .accessibilityIdentifier("source-glyph")
    }
}
