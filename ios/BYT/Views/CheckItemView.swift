import SwiftUI

/// The camera (or a picked photo), then one line: what the item is, its verdict, and where it was read.
struct CheckItemView: View {
    let model: AppModel

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                CaptureView(camera: model.camera) { data, _ in await model.readPhoto(data) }
                LabelWordsField(model: model)
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
        .navigationTitle("Check an item")
        .sheet(isPresented: Binding(get: { model.askingConsent }, set: { _ in })) {
            ConsentSheet(crop: model.pendingCrop) { allow in Task { await model.answerConsent(allow) } }
        }
    }
}

/// The label's words, typed or scanned with the keyboard's own Scan Text, read on this iPhone.
private struct LabelWordsField: View {
    let model: AppModel
    @State private var words = ""
    @State private var reading = false

    var body: some View {
        VStack(spacing: 10) {
            TextField("Or type the words on the label", text: $words, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .font(.title3)
                .accessibilityIdentifier("label-words")
            Button("Read these words") {
                Task {
                    reading = true
                    await model.readWords(words)
                    reading = false
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(reading || words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}
