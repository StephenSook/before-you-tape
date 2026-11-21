import SwiftUI

/// The one-time cloud question, asked before the first cloud call. Built on the web app's sentence
/// (src/ui/ConsentNotice.tsx), for this iPhone: it also names the second look of a read already made,
/// and says the photo or the label words typed or scanned go, never both. Changing these words means
/// raising `BoxStore.consentVersion`, so an earlier "allowed" is asked again.
struct ConsentSheet: View {
    static let sentence = "To check items this iPhone can't read, and to check a read again when the rules ask, a cropped photo of the item, or the label words you typed or scanned, goes to Google's Gemini. Allow?"
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
