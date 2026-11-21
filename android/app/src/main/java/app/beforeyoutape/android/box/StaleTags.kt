package app.beforeyoutape.android.box

import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.RuleHit
import app.beforeyoutape.engine.VerdictLevel
import kotlinx.serialization.json.JsonPrimitive

/**
 * An item's labelTags were made by one rule edition's label words; a newer edition can add words (a new rule), and
 * old tags cannot show them. As the web app (src/data/tagsVersion.ts) and the iPhone app do, each item keeps the
 * edition whose words made its tags ([BoxItem.tagsEdition]), and an item whose tags came from a label under other
 * words is never judged OK on them. Only a new reading with label text, or the sender typing a label, releases it:
 * never a blank label, an edit of another field, or a restart, since staleness is read from what is saved alone.
 */
object StaleTags {
    const val RULES_CHANGED = "The rules changed since this label was read. Photograph or type the label again."
    const val LABEL_UNKNOWN = "An earlier version of this app saved this item. Photograph or type the label again."
    /** Why a lithium item waits: the box-wide total may be missing an item whose label is read again. */
    const val LITHIUM_WAITS = "Another item in this box needs its label read again before the lithium total is known."
    /** The box's lithium line while any item's label must be read again. */
    const val LITHIUM_BOX_WAITS = "An item in this box needs its label read again before the lithium total is known."

    /** The tag a label's words always add (src/engine/facts.ts LABEL_TEXT_TAG): tags without it came from no label. */
    const val LABEL_TEXT_TAG = "label_text"

    /**
     * The engine's own headline for its middle level (src/engine/verdict.ts HEADLINE.check, pinned by StaleTagsTest).
     * This hold is the app's one verdict change, as in the web app (src/data/tagsVersion.ts) and the iPhone app.
     */
    const val CHECK_HEADLINE = "Check this"

    fun hasWords(label: String?) = !label.isNullOrBlank()

    private fun typedLabel(input: BoxItemInput): String? =
        (input.overrides["labelText"] as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** The edition that makes the tags of [label] now: "" when it has no words, so its tags depend on no edition. */
    fun editionFor(label: String?, current: String?): String? = if (hasWords(label)) current else ""

    /** The edition to record for an item whose tags were just made from its label (a typed label wins). */
    fun editionFor(input: BoxItemInput, current: String?): String? = editionFor(typedLabel(input) ?: input.read.labelText, current)

    /** Its tags came from a label (they hold label_text), and words other than the current ones, or unknown ones, made them. */
    fun isStale(item: BoxItem, current: String?): Boolean {
        if (current == null || LABEL_TEXT_TAG !in item.input.labelTags) return false
        val tagged = item.tagsEdition ?: return true
        return tagged.isNotEmpty() && tagged != current
    }

    /**
     * A stale item is never OK: it is held at the engine's check level with why, and while one is in the box the
     * lithium total waits, so no lithium item is OK on it either. A check or take-out verdict is never changed.
     */
    fun guard(result: BoxResult, items: List<BoxItem>, current: String?): BoxResult {
        val stale = items.filter { isStale(it, current) }
        if (stale.isEmpty()) return result
        val verdicts = result.items.toMutableMap()
        var counts = result.counts
        fun withhold(id: String, reason: String) {
            val v = verdicts[id]?.takeIf { it.level == VerdictLevel.ok } ?: return
            val hit = RuleHit("DATA-LABEL-AGAIN", "data", "check", reason, "Before You Tape: reading check", "https://before-you-tape-2026.web.app/rules")
            verdicts[id] = v.copy(level = VerdictLevel.check, headline = CHECK_HEADLINE, hits = listOf(hit) + v.hits)
            counts = counts.copy(ok = counts.ok - 1, check = counts.check + 1)
        }
        for (item in stale) withhold(item.input.itemId, if (item.tagsEdition == null) LABEL_UNKNOWN else RULES_CHANGED)
        var lithium = result.lithium
        if (lithium.status == "ok" || lithium.status == "none") {
            lithium = lithium.copy(status = "depends", text = LITHIUM_BOX_WAITS)
            for (id in result.lithium.itemIds) withhold(id, LITHIUM_WAITS)
        }
        return result.copy(items = verdicts, counts = counts, lithium = lithium)
    }
}
