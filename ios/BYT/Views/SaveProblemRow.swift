import SwiftUI

/// Says that the last change is not saved on this iPhone, with a way to try again. Nothing shows
/// while saving works.
struct SaveProblemRow: View {
    let box: BoxStore

    var body: some View {
        if let problem = box.saveProblem {
            VStack(spacing: 8) {
                Text(problem).foregroundStyle(.red).multilineTextAlignment(.center)
                    .accessibilityIdentifier("box-save-problem")
                Button("Try saving again") { box.retrySave() }
                    .accessibilityIdentifier("box-save-retry")
            }
        }
    }
}
