import Foundation

/// The model's instructions for an item read, word for word from the web app's
/// src/ai/prompts.ts (a test compares them). The model reads; the rules engine decides.
enum Prompts {
    static let itemReadSystemLines = [
        "You read one photo of one item a person plans to send abroad, and fill in every field of the JSON reply from what you can see.",
        "Write 0 for any number that is not printed on the item.",
        "Never calculate a number.",
        "Copy label text exactly as printed.",
        "If you are not sure what the item is, set evidence to not_sure and category to other.",
    ]
    static var itemReadSystem: String { itemReadSystemLines.joined(separator: "\n") }

    static let itemReadPhoto =
        "Read the item in this photo. Set evidence to label_read if you read its label, or item_seen if you can only see the item. "
        + "Keep labelText to the words that say what the item is or what is in it, at most 160 characters."
}
