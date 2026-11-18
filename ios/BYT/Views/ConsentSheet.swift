import SwiftUI

/// The one-time cloud question, asked before the first cloud call. The web app's sentence, for
/// this iPhone (src/ui/ConsentNotice.tsx).
struct ConsentSheet: View {
    static let sentence = "To check items when this iPhone can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?"
    static let allowLabel = "Allow"
    static let keepLabel = "Keep everything on this iPhone"

    let onChoice: (Bool) -> Void

    var body: some View {
        VStack(spacing: 20) {
            Text(Self.sentence)
                .font(.title3)
                .multilineTextAlignment(.center)
            Button(Self.allowLabel) { onChoice(true) }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            Button(Self.keepLabel) { onChoice(false) }
                .buttonStyle(.bordered)
                .controlSize(.large)
        }
        .padding(24)
        .presentationDetents([.medium])
        .interactiveDismissDisabled()
        .accessibilityIdentifier("consent-sheet")
    }
}
