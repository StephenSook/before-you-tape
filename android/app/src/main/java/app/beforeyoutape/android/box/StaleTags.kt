package app.beforeyoutape.android.box

import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.RuleHit
import app.beforeyoutape.engine.VerdictLevel
import kotlinx.serialization.json.JsonPrimitive

/**
 * An item's labelTags were made by one rule edition's label words; a newer edition can add words (a new rule), and
 * old tags cannot show them. As the iPhone app does (ios/BYT/Data/BoxStore.swift), each item keeps the edition that
 * made its tags ([BoxItem.tagsEdition]): a label this phone still holds whole is tagged again under the edition in
 * use, and an item whose label it cannot read again (cut, or gone) is never OK until the sender reads it again.
 */
object StaleTags {
    const val RULES_CHANGED = "The rules changed since this label was read. Photograph or type the label again."
    const val LABEL_UNKNOWN = "An earlier version of this app saved this item. Photograph or type the label again."
    /** Why a lithium item waits: the box-wide total may be missing an item whose label is read again. */
    const val LITHIUM_WAITS = "Another item in this box needs its label read again before the lithium total is known."
    /** The box's lithium line while any item's label must be read again. */
    const val LITHIUM_BOX_WAITS = "An item in this box needs its label read again before the lithium total is known."

    /** A read's label text is kept clipped to this many characters (src/shared/itemRead.ts); at this length it may be cut. */
    const val LABEL_TEXT_MAX = 160

    /**
     * The engine's own headline for its middle level (src/engine/verdict.ts HEADLINE.check, pinned by StaleTagsTest).
     * This hold is the app's one verdict change, as in the web app (src/data/tagsVersion.ts) and the iPhone app.
     */
    const val CHECK_HEADLINE = "Check this"

    private fun hasWords(label: String?) = !label.isNullOrBlank()

    private fun typedLabel(input: BoxItemInput): String? =
        (input.overrides["labelText"] as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** The label the item's tags came from: a typed label wins over the read's. */
    private fun label(input: BoxItemInput): String = typedLabel(input) ?: input.read.labelText

    /** The whole label this phone holds: a typed label, or a read label short enough that it was not cut. */
    private fun wholeLabel(input: BoxItemInput): String? {
        val typed = typedLabel(input)
        if (typed != null) return typed.takeIf(::hasWords)
        val read = input.read.labelText
        return read.takeIf { hasWords(it) && it.codePointCount(0, it.length) < LABEL_TEXT_MAX }
    }

    /** The edition that makes the tags of [label] now: "" when it has no words, so its tags depend on no edition. */
    fun editionFor(label: String?, current: String?): String? = if (hasWords(label)) current else ""

    /** The edition to record for an item's newly made tags. */
    fun editionFor(input: BoxItemInput, current: String?): String? = editionFor(label(input), current)

    fun isStale(item: BoxItem, current: String?): Boolean {
        if (current == null) return false
        // Unknown provenance counts as another edition's; no label words depend on no edition.
        val tagged = item.tagsEdition ?: return true
        return tagged.isNotEmpty() && tagged != current
    }

    /**
     * A box saved before the edition was kept: an item with no label words on this phone made no tags from words.
     * Every label this phone saw is kept on it, so an empty one had none.
     */
    fun settleUnknown(items: List<BoxItem>): List<BoxItem> =
        items.map { if (it.tagsEdition == null && !hasWords(label(it.input))) it.copy(tagsEdition = "") else it }

    /** A stale item whose whole label is on this phone is tagged again under [current]; when [tagger] cannot, it stays stale. */
    fun refresh(items: List<BoxItem>, current: String?, tagger: (String) -> List<String>?): List<BoxItem> = items.map { item ->
        if (!isStale(item, current)) return@map item
        val whole = wholeLabel(item.input) ?: return@map item
        val tags = tagger(whole) ?: return@map item
        item.copy(input = item.input.copy(labelTags = tags), tagsEdition = current)
    }

    /**
     * A stale item is never OK: it is held at the engine's check level with why, and while one is in the box the
     * lithium total waits, so no lithium item is OK on it either. A check or take-out verdict is never changed.
     */
    fun guard(result: BoxResult, items: List<BoxItem>, current: String?): BoxResult {
        val verdicts = result.items.toMutableMap()
        var counts = result.counts
        fun withhold(id: String, reason: String) {
            val v = verdicts[id]?.takeIf { it.level == VerdictLevel.ok } ?: return
            val hit = RuleHit("DATA-LABEL-AGAIN", "data", "check", reason, "Before You Tape: reading check", "https://before-you-tape-2026.web.app/rules")
            verdicts[id] = v.copy(level = VerdictLevel.check, headline = CHECK_HEADLINE, hits = listOf(hit) + v.hits)
            counts = counts.copy(ok = counts.ok - 1, check = counts.check + 1)
        }
        val stale = items.filter { isStale(it, current) }
        // Even marked to take out, the item is in the box until the sender removes it.
        for (item in stale) withhold(item.input.itemId, if (item.tagsEdition == null) LABEL_UNKNOWN else RULES_CHANGED)
        var lithium = result.lithium
        if (stale.isNotEmpty() && (lithium.status == "ok" || lithium.status == "none")) {
            lithium = lithium.copy(status = "depends", text = LITHIUM_BOX_WAITS)
            for (id in result.lithium.itemIds) withhold(id, LITHIUM_WAITS)
        }
        return result.copy(items = verdicts, counts = counts, lithium = lithium)
    }
}
