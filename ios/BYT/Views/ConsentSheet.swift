import SwiftUI

/// The one-time cloud question, asked before the first cloud call. The web app's sentence, for
/// this iPhone (src/ui/ConsentNotice.tsx).
struct ConsentSheet: View {
    static let sentence = "To check items when this iPhone can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?"
    static let allowLabel = "Allow"
    static let keepLabel = "Keep everything on this iPhone"

    /// The exact crop that would be sent, when the question comes from a photo.
    var crop: Data? = nil
    let onChoice: (Bool) -> Void

    var body: some View {
        VStack(spacing: 20) {
            if let crop, let image = UIImage(data: crop) {
                Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 180)
                    .accessibilityLabel("The part of the photo that would be sent")
            }
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
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("consent-sheet")
    }
}
