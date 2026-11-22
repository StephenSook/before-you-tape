package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.EngineError
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.LabelFigures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/** The rules engine as the box sees it. */
fun interface BoxEngine {
    fun evaluate(items: List<BoxItemInput>, code: String, today: String): BoxResult
}

/** Pure changes to the box. None of them calls a model. */
object BoxLogic {
    fun empty(destinationCode: String) = BoxState(
        boxId = null, destinationCode = destinationCode, items = emptyList(), result = null, cloudConsent = null,
        onDeviceReads = 0, cloudReads = 0, rulesOnlyRechecks = 0, engineError = null,
    )

    /** A photo read. [labelFigures] are the engine's figures for its whole label, kept since its text is clipped. */
    fun addRead(
        s: BoxState, read: ItemReadWire, labelTags: List<String>, source: Source, ms: Long, newId: String,
        labelFigures: LabelFigures? = null,
    ): BoxState {
        val input = BoxItemInput(newId, read, JsonObject(emptyMap()), emptyMap(), 1.0, null, labelTags, labelFigures = labelFigures)
        val readSource = if (source == Source.ON_DEVICE) "phone_on_device" else "phone_cloud"
        return s.copy(
            items = s.items + BoxItem(input, readSource, ms.toDouble(), null),
            onDeviceReads = s.onDeviceReads + if (source == Source.ON_DEVICE) 1 else 0,
            cloudReads = s.cloudReads + if (source == Source.IN_CLOUD) 1 else 0,
        )
    }

    /** A typed item: the sender's own, so its identity is confirmed by the sender, and so are its numbers. */
    fun addManual(s: BoxState, read: ItemReadWire, labelTags: List<String>, newId: String, labelFigures: LabelFigures? = null): BoxState {
        // A typed item is the sender's own word: a ticked alcohol line is kept as theirs, so the
        // rules treat it like an answer of yes and do not ask again (as the web app does).
        val overrides = if (read.alcoholOnLabel) mapOf("alcoholOnLabel" to kotlinx.serialization.json.JsonPrimitive(true)) else emptyMap()
        val input = BoxItemInput(newId, read, JsonObject(overrides), emptyMap(), 1.0, "sender", labelTags, numbersFrom = TYPED, labelFigures = labelFigures)
        return s.copy(items = s.items + BoxItem(input, MANUAL, 0.0, null))
    }

    /**
     * A loaded item's input with numbersFrom put back: a typed item (read source "manual") says "typed". The synced
     * document has no such key, and a box saved on this phone before it was kept has none either.
     */
    fun withNumbersFrom(input: BoxItemInput, readSource: String): BoxItemInput =
        if (readSource == MANUAL && input.numbersFrom == null) input.copy(numbersFrom = TYPED) else input

    private const val MANUAL = "manual"
    private const val TYPED = "typed"

    /**
     * Fields the sender corrected, kept as overrides on top of the read. A corrected label brings its
     * own tags ([labelTags]) and figures ([labelFigures], merged with the item's by the engine); otherwise
     * the item keeps them.
     */
    fun override(
        s: BoxState, itemId: String, patch: Map<String, JsonElement>, labelTags: List<String>?, labelFigures: LabelFigures? = null,
    ): BoxState = s.copy(
        items = s.items.map {
            if (it.input.itemId != itemId) it
            else it.copy(input = it.input.copy(
                overrides = JsonObject(it.input.overrides + patch), labelTags = labelTags ?: it.input.labelTags,
                labelFigures = labelFigures ?: it.input.labelFigures,
            ))
        },
    )

    /**
     * The label texts a typed label's figures come from. With none kept yet (an item read before they were kept),
     * the read's own label comes too, so its figures are not lost.
     */
    fun figureTexts(input: BoxItemInput, typedLabel: String): List<String> =
        if (input.labelFigures == null && input.read.labelText.isNotBlank()) listOf(input.read.labelText, typedLabel) else listOf(typedLabel)

    /** 1 to 99, rounded, as the web app keeps it; anything not a number is 1. */
    fun setQuantity(s: BoxState, itemId: String, n: Double): BoxState {
        val q = if (n.isFinite()) kotlin.math.round(n).coerceIn(1.0, 99.0) else 1.0
        return s.copy(items = s.items.map { if (it.input.itemId == itemId) it.copy(input = it.input.copy(quantity = q)) else it })
    }

    /** One tap of "One more" (1) or "One fewer" (-1), applied to the current quantity. */
    fun stepQuantity(s: BoxState, itemId: String, step: Int): BoxState {
        val now = s.items.firstOrNull { it.input.itemId == itemId }?.input?.quantity ?: return s
        return setQuantity(s, itemId, now + step)
    }

    fun remove(s: BoxState, itemId: String): BoxState = s.copy(items = s.items.filter { it.input.itemId != itemId })

    fun answer(s: BoxState, itemId: String, questionId: String, answerId: String): BoxState = s.copy(
        items = s.items.map { if (it.input.itemId == itemId) it.copy(input = it.input.copy(answers = it.input.answers + (questionId to answerId))) else it },
    )

    /** A new destination; the box is re-checked by the rules alone, so no model is called. */
    fun setDestination(s: BoxState, code: String): BoxState =
        s.copy(destinationCode = code, rulesOnlyRechecks = s.rulesOnlyRechecks + if (s.items.isEmpty()) 0 else 1)

    fun withResult(s: BoxState, result: BoxResult): BoxState = s.copy(result = result, engineError = null)

    fun withEngineError(s: BoxState, name: String): BoxState = s.copy(result = null, engineError = name)

    /**
     * [patch] with the numbers that come with a typed deciding number, as the sender's own (rule edition 7): a typed
     * Wh above 0 brings the volts and capacity (mAh) shown, typed lithium grams above 0 bring the volts shown, each only
     * when it is above 0 and not typed itself. Never Wh with grams or grams with Wh. Nothing comes when the patch sets
     * any battery number to 0. (This app runs no second look, so no item carries a numbers dispute.)
     */
    fun withCompanions(input: BoxItemInput, patch: Map<String, JsonElement>): Map<String, JsonElement> {
        fun typed(f: String) = (patch[f] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()
        if (BATTERY_NUMBERS.any { typed(it) == 0.0 }) return patch
        val bring = buildList {
            if ((typed("wattHours") ?: 0.0) > 0) addAll(listOf("volts", "milliampHours"))
            if ((typed("lithiumGrams") ?: 0.0) > 0) add("volts")
        }.distinct().filter { it !in patch }
        if (bring.isEmpty()) return patch
        val shown = effectiveRead(input)
        return patch + bring.mapNotNull { f -> batteryNumber(shown, f).takeIf { it > 0 }?.let { f to kotlinx.serialization.json.JsonPrimitive(it) } }
    }

    /**
     * What the label check on a held battery saves (rule edition 7): [value], the Wh or lithium grams the sender typed
     * from the label, compared with the model's own reading only (a number the sender typed earlier confirms nothing
     * more). A match within [tolerancePct] saves the typed number with the numbers it brings; otherwise the typed
     * number alone. The typed number is always the one kept. Null when the value is not a number above 0.
     */
    fun labelNumberPatch(input: BoxItemInput, field: String, value: Double, tolerancePct: Double?): Map<String, JsonElement>? {
        if (!value.isFinite() || value <= 0) return null
        val read = if (field in input.overrides) 0.0 else batteryNumber(input.read, field)
        val matches = tolerancePct != null && read > 0 && kotlin.math.abs(value - read) / read * 100 <= tolerancePct
        val typed = mapOf(field to kotlinx.serialization.json.JsonPrimitive(value))
        return if (matches) withCompanions(input, typed) else typed
    }

    /** The number the label check asks for: the Wh when Wh is shown, otherwise the lithium grams. */
    fun labelNumberField(shown: ItemReadWire): String = if (shown.wattHours > 0) "wattHours" else "lithiumGrams"

    /** The typed text as a number above 0 (a comma is a decimal point), or null. */
    fun labelNumberValue(text: String): Double? =
        text.trim().replace(",", ".").toDoubleOrNull()?.takeIf { it.isFinite() && it > 0 }

    /** The edition's limits.whTolerancePct, or null when it cannot be read (then nothing matches). */
    fun whTolerancePct(editionJson: String?): Double? = runCatching {
        Json.parseToJsonElement(editionJson ?: return null).jsonObject["limits"]?.jsonObject?.get("whTolerancePct")
            ?.let { it as? kotlinx.serialization.json.JsonPrimitive }?.takeIf { !it.isString }?.content?.toDoubleOrNull()
    }.getOrNull()

    private val BATTERY_NUMBERS = listOf("volts", "milliampHours", "wattHours", "lithiumGrams")

    private fun batteryNumber(r: ItemReadWire, f: String): Double = when (f) {
        "volts" -> r.volts
        "milliampHours" -> r.milliampHours
        "wattHours" -> r.wattHours
        "lithiumGrams" -> r.lithiumGrams
        else -> error("not a battery number: $f")
    }

    /**
     * The read with the sender's fixes applied, as the form shows it. An override the read type
     * cannot take (typed text in a number field) is left out here; the engine still judges it.
     */
    fun effectiveRead(input: BoxItemInput): ItemReadWire {
        var obj = Json.encodeToJsonElement(ItemReadWire.serializer(), input.read).jsonObject
        for ((k, v) in input.overrides) {
            val next = JsonObject(obj + (k to v))
            if (runCatching { Json.decodeFromJsonElement(ItemReadWire.serializer(), next) }.isSuccess) obj = next
        }
        return Json.decodeFromJsonElement(ItemReadWire.serializer(), obj)
    }

    /** The item as it may leave the phone: the label text, read or typed, stays here; its tags travel instead. */
    fun forSync(input: BoxItemInput): BoxItemInput {
        // Names never leave the phone: not the model's name, not a typed correction. The synced read
        // names only the category, the corrected one when a correction changed it.
        val overrides = input.overrides - "labelText" - "itemName"
        val category = (overrides["category"] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content
            ?.let { c -> app.beforeyoutape.engine.ItemCategoryWire.entries.firstOrNull { it.name == c } } ?: input.read.category
        val name = app.beforeyoutape.android.ui.ReadCopy.CATEGORIES[category] ?: category.name
        return input.copy(read = input.read.copy(labelText = "", itemName = name), overrides = JsonObject(overrides))
    }
}

/**
 * Holds the box and re-checks it through the engine after every change. [edition] is the rule edition in use (null
 * while no rules are loaded), so an item tagged under another edition is held ([StaleTags]).
 */
class BoxController(
    initial: BoxState,
    private val engine: BoxEngine,
    private val today: () -> String,
    private val edition: () -> String? = { null },
) {
    var state: BoxState = initial
        private set

    private fun recheck() {
        val current = edition()
        state = try {
            if (state.items.isEmpty()) state.copy(result = null)
            else BoxLogic.withResult(state, StaleTags.guard(engine.evaluate(state.items.map { it.input }, state.destinationCode, today()), state.items, current))
        } catch (e: EngineError) {
            BoxLogic.withEngineError(state, e.errorName)
        }
    }

    /** A saved box (after Android stopped the process): its verdicts are recomputed, never restored. */
    fun restore(saved: BoxState) {
        state = saved.copy(result = null, engineError = null)
        recheck()
    }

    /** Records that [itemId]'s tags were just made from its current label, under the edition in use. */
    private fun stamp(itemId: String) {
        val current = edition()
        state = state.copy(items = state.items.map { if (it.input.itemId == itemId) it.copy(tagsEdition = StaleTags.editionFor(it.input, current)) else it })
    }

    fun addRead(read: ItemReadWire, labelTags: List<String>, source: Source, ms: Long, newId: String, labelFigures: LabelFigures? = null) {
        state = BoxLogic.addRead(state, read, labelTags, source, ms, newId, labelFigures)
        stamp(newId)
        recheck()
    }

    fun answer(itemId: String, questionId: String, answerId: String) {
        state = BoxLogic.answer(state, itemId, questionId, answerId)
        recheck()
    }

    fun addManual(read: ItemReadWire, labelTags: List<String>, newId: String, labelFigures: LabelFigures? = null) {
        state = BoxLogic.addManual(state, read, labelTags, newId, labelFigures)
        stamp(newId)
        recheck()
    }

    fun override(itemId: String, patch: Map<String, JsonElement>, labelTags: List<String>?, labelFigures: LabelFigures? = null) {
        val before = state.items.firstOrNull { it.input.itemId == itemId }
        val label = (patch["labelText"] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content
        // Blank words are not a label: a stale item keeps its tags, and so stays held, until real words are typed.
        val keepStale = label != null && !StaleTags.hasWords(label) && before != null && StaleTags.isStale(before, edition())
        state = BoxLogic.override(state, itemId, patch, if (keepStale) null else labelTags, labelFigures)
        if (label != null && !keepStale) stamp(itemId)
        recheck()
    }

    fun setQuantity(itemId: String, n: Double) {
        state = BoxLogic.setQuantity(state, itemId, n)
        recheck()
    }

    fun remove(itemId: String) {
        state = BoxLogic.remove(state, itemId)
        recheck()
    }

    fun stepQuantity(itemId: String, step: Int) {
        state = BoxLogic.stepQuantity(state, itemId, step)
        recheck()
    }

    fun setDestination(code: String) {
        state = BoxLogic.setDestination(state, code)
        recheck()
    }

    /** The rules edition changed: the box is re-checked against the rules now in use. */
    fun rulesChanged() = recheck()
}
