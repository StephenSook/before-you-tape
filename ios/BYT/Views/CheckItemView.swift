import SwiftUI

/// The camera (or a picked photo), then one line: what the item is, its verdict, and where it was read.
struct CheckItemView: View {
    let model: AppModel

    var body: some View {
        ScrollViewReader { page in
            ScrollView {
                VStack(spacing: 16) {
                    CaptureView(camera: model.camera) { data, _ in await model.readPhoto(data) }
                    // Said only when a photo is not read on this iPhone: why, and what to do instead.
                    if let notice = model.photoNotice {
                        Text(notice).font(.callout).multilineTextAlignment(.center).accessibilityIdentifier("photo-notice")
                    }
                    LabelWordsField(model: model) { page.scrollTo(LabelWordsField.readButton, anchor: .bottom) }
                    if let crop = model.lastCrop, let image = UIImage(data: crop) {
                        Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 180)
                            .accessibilityLabel("The part of the photo that was read")
                        Text("Only this part of the photo was read.").font(.callout)
                    }
                    if let line = model.readLine {
                        Text(line)
                            .font(.title3)
                            .multilineTextAlignment(.center)
                            .accessibilityIdentifier("read-line")
                    }
                    // A read that could not be saved says so here, where it was added, not only in the box.
                    if let box = model.box { SaveProblemRow(box: box) }
                    // The sender can take the cloud choice back at any time; turning it on again asks first.
                    if let choice = model.cloudChoice {
                        VStack(spacing: 8) {
                            Text(choice.line).font(.callout).multilineTextAlignment(.center)
                            Button(choice.button) {
                                if model.box?.cloudConsent == true { model.turnOffCloudChecks() } else { model.turnOnCloudChecks() }
                            }
                            .buttonStyle(.bordered)
                        }
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("cloud-choice")
                    }
                }
                .padding()
            }
            // Swiping the page down closes the keyboard.
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle("Check an item")
        // A question asked for an offered look on the box screen is shown there, not here.
        .sheet(isPresented: Binding(get: { model.askingConsent && model.lookAwaitingConsent == nil }, set: { _ in })) {
            ConsentSheet(crop: model.pendingCrop) { allow in Task { await model.answerConsent(allow) } }
        }
    }
}

/// The label's words, typed or scanned with the keyboard's own Scan Text, read on this iPhone. The live
/// camera puts this field low on the screen, so while the keyboard is up the page keeps "Read these
/// words" above it. That button and Return both read the words and close the keyboard.
struct LabelWordsField: View {
    static let readButton = "read-words"
    let model: AppModel
    /// Scrolls the page so the read button sits just above the keyboard.
    var showReadButton: () -> Void
    @State private var words = ""
    @State private var reading = false
    @FocusState private var typing: Bool

    /// True when the changed part of the words is now one newline: the sender pressed Return, with or
    /// without words selected. Scan Text can bring several lines at once, and those stay as they are.
    static func isTypedReturn(old: String, new: String) -> Bool {
        let before = Array(old), after = Array(new)
        var start = 0
        while start < before.count, start < after.count, before[start] == after[start] { start += 1 }
        var end = 0
        while end < before.count - start, end < after.count - start,
              before[before.count - 1 - end] == after[after.count - 1 - end] { end += 1 }
        let put = after[start..<(after.count - end)]
        return put.count == 1 && put.first?.isNewline == true
    }

    var body: some View {
        VStack(spacing: 10) {
            TextField("Or type the words on the label", text: $words, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .font(.title3)
                .submitLabel(.done)
                .focused($typing)
                .accessibilityIdentifier("label-words")
                .onChange(of: words) { old, new in
                    if Self.isTypedReturn(old: old, new: new) {
                        // Return keeps any selected words; it does not replace them.
                        words = old
                        // Return closes the keyboard even when there is nothing to read yet.
                        typing = false
                        read()
                    } else if typing {
                        // A longer label grows the field and pushes the button down.
                        showReadButton()
                    }
                }
            Button("Read these words") { read() }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(reading || words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .id(Self.readButton)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
            if typing { showReadButton() }
        }
    }

    private func read() {
        // Set before the read starts, so a second tap or a Return right after it reads nothing twice.
        guard !reading, !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        reading = true
        // The verdict shows under the button, so the keyboard closes rather than cover it.
        typing = false
        Task {
            await model.readWords(words)
            reading = false
        }
    }
}
