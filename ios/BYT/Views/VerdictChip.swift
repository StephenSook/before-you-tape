import SwiftUI

/// A verdict is never shown by colour alone: each chip carries its word and its own icon.
struct VerdictChip: View {
    let level: String

    static func word(_ level: String) -> String {
        switch level {
        case "ok": "OK to pack"
        case "take_out": "Take it out"
        default: "Check this"
        }
    }

    static func icon(_ level: String) -> String {
        switch level {
        case "ok": "checkmark"
        case "take_out": "xmark"
        default: "magnifyingglass"
        }
    }

    private var tint: Color {
        switch level {
        case "ok": .green
        case "take_out": .red
        default: .orange
        }
    }

    var body: some View {
        Label {
            Text(Self.word(level))
        } icon: {
            Image(systemName: Self.icon(level)).foregroundStyle(tint)
        }
            .font(.title3.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(tint.opacity(0.18), in: Capsule())
            .overlay(Capsule().stroke(tint, lineWidth: 2))
            .accessibilityIdentifier("verdict-chip")
    }
}
