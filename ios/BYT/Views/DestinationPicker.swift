import SwiftUI

/// The country the box goes to. A change re-checks every item by the rules alone.
struct DestinationPicker: View {
    let destinations: [Destination]
    let box: BoxStore

    var body: some View {
        Picker("Sending to", selection: Binding(get: { box.destinationCode }, set: { box.setDestination($0) })) {
            ForEach(destinations, id: \.code) { Text($0.name).tag($0.code) }
        }
        .accessibilityIdentifier("destination-picker")
    }
}
