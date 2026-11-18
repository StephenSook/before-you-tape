package app.beforeyoutape.android.ai

/**
 * The web app's item-read prompt (src/ai/prompts.ts), word for word; PromptsTest compares both
 * against that file. The shared bundle takes these over in bridge v2, and this copy goes.
 */
object Prompts {
    val ITEM_READ_SYSTEM: String = listOf(
        "You read one photo of one item a person plans to send abroad, and fill in every field of the JSON reply from what you can see.",
        "Write 0 for any number that is not printed on the item.",
        "Never calculate a number.",
        "Copy label text exactly as printed.",
        "If you are not sure what the item is, set evidence to not_sure and category to other.",
    ).joinToString("\n")

    const val ITEM_READ_PROMPT: String =
        "Read the item in this photo. Set evidence to label_read if you read its label, or item_seen if you can only see the item. " +
            "Keep labelText to the words that say what the item is or what is in it, at most 160 characters."
}
