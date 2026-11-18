import SwiftUI

/// The whole box at a glance, and after a country change the line that says no model ran.
struct BoxSummaryView: View {
    let box: BoxStore

    static func recheckLine(items: Int, country: String, ms: Double) -> String {
        "Re-checked \(items) items for \(country) in \(Int(ms.rounded())) ms. 0 model calls."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if box.items.isEmpty {
                Text("Nothing in the box yet.")
            } else if let c = box.result?.counts {
                if c.takeOut > 0 { Text("\(c.takeOut) to take out") }
                if c.check > 0 { Text("\(c.check) to check") }
                if c.ok > 0 { Text("\(c.ok) OK to pack") }
            }
            if let lithium = box.result?.lithium, ["over", "mixed", "depends"].contains(lithium.status) { Text(lithium.text) }
            if let ms = box.lastRecheckMs, let country = box.result?.destination.name {
                Text(Self.recheckLine(items: box.items.count, country: country, ms: ms)).accessibilityIdentifier("recheck-line")
            }
            if let problem = box.engineProblem { Text("The rules could not run: \(problem)") }
        }
        .font(.title3)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("box-summary")
    }
}
