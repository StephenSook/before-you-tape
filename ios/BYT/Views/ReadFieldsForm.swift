import BYTCore
import SwiftUI

/// The fields of a reading as the sender edits them: what it is, its name, the label's words, the
/// numbers printed on it, what it is like, and its box.
struct ReadFieldsForm: View {
    @Binding var draft: ReadDraft

    var body: some View {
        Section {
            Picker("What is it?", selection: $draft.category) {
                Text("Pick one").tag("")
                ForEach(ReadDraft.categories, id: \.id) { Text($0.label).tag($0.id) }
            }
            TextField("Name", text: $draft.itemName)
            TextField("Words on the label", text: $draft.labelText, axis: .vertical)
            if !draft.labelValid { Text("The label words can be at most \(ReadDraft.labelTextMax) characters.") }
        }
        Section("Numbers printed on it") {
            ForEach(ReadDraft.numberFields, id: \.id) { f in
                TextField(f.label, text: Binding(get: { draft.numbers[f.id] ?? "" }, set: { draft.numbers[f.id] = $0 }))
                    .keyboardType(.decimalPad)
            }
            if !draft.numbersValid { Text("Numbers must be 0 or more.") }
        }
        Section {
            ForEach(ReadDraft.flagFields, id: \.id) { f in
                Toggle(f.label, isOn: Binding(get: { draft.flags[f.id] ?? false }, set: { draft.flags[f.id] = $0 }))
            }
            Picker("Its box", selection: $draft.retailBox) {
                ForEach(ReadDraft.boxChoices, id: \.id) { Text($0.label).tag($0.id) }
            }
        }
    }
}

/// The sender corrects what was read. Only the fields they edited are saved, on top of the read. A second
/// look can land while the form is open: a field it moved shows the new reading, and one the sender had
/// edited is reset to it with a note, so no choice made against the old reading is saved.
struct FixReadingView: View {
    let item: BoxItem
    let box: BoxStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft: ReadDraft
    /// The reading the draft is measured against, and the edited fields a second look reset.
    @State private var base: JSONValue
    @State private var reset: [String] = []

    init(item: BoxItem, box: BoxStore) {
        self.item = item
        self.box = box
        _draft = State(initialValue: ReadDraft.of(Self.current(item)))
        _base = State(initialValue: Self.current(item))
    }

    /// The reading as the sender sees it now: the read with their earlier fixes on top.
    static func current(_ item: BoxItem) -> JSONValue {
        guard case var .object(o) = item.read else { return item.read }
        o.merge(item.overrides) { _, fix in fix }
        return .object(o)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let line = ReadDraft.changedLine(reset) { Text(line).accessibilityIdentifier("fix-reading-reset") }
                ReadFieldsForm(draft: $draft)
            }
                .navigationTitle("Fix this reading")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            box.applyFix(item.itemId, patch: draft.fixPatch(from: base))
                            dismiss()
                        }
                        .disabled(!draft.canSave)
                    }
                }
        }
        .accessibilityIdentifier("fix-reading")
        // The reading changed under the form: once per change.
        .onChange(of: Self.current(item)) { _, now in
            reset = draft.rebase(from: base, to: now)
            base = now
        }
        // A reset field the sender edits again is theirs again.
        .onChange(of: draft.touched) { _, touched in reset.removeAll { touched.contains($0) } }
    }
}

/// The sender types an item instead of showing it. It counts as typed by the sender, never as a model read.
struct TypedEntryView: View {
    let box: BoxStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ReadDraft.of(nil)

    var body: some View {
        NavigationStack {
            Form { ReadFieldsForm(draft: $draft) }
                .navigationTitle("Type it")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") {
                            if let read = draft.manualRead() { box.addManual(read) }
                            dismiss()
                        }
                        .disabled(draft.manualRead() == nil)
                    }
                }
        }
        .accessibilityIdentifier("type-it")
    }
}
