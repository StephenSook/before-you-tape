import SwiftUI

/// The camera (or a picked photo), then one line: what the item is, its verdict, and where it was read.
struct CheckItemView: View {
    let model: AppModel

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                CaptureView(camera: model.camera) { data, _ in await model.readPhoto(data) }
                LabelWordsField(model: model)
                if let line = model.readLine {
                    Text(line)
                        .font(.title3)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("read-line")
                }
            }
            .padding()
        }
        .navigationTitle("Check an item")
        .sheet(isPresented: Binding(get: { model.askingConsent }, set: { _ in })) {
            ConsentSheet { allow in Task { await model.answerConsent(allow) } }
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
