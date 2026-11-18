import SwiftUI

/// The camera (or a picked photo), then one line: what the item is, its verdict, and where it was read.
struct CheckItemView: View {
    let model: AppModel

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                CaptureView(camera: model.camera) { data, _ in await model.readPhoto(data) }
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
    }
}
