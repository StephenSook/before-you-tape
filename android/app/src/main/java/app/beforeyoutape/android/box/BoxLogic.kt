package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.EngineError
import app.beforeyoutape.engine.ItemReadWire
import kotlinx.serialization.json.JsonObject

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

    fun addRead(s: BoxState, read: ItemReadWire, labelTags: List<String>, source: Source, ms: Long, newId: String): BoxState {
        val input = BoxItemInput(newId, read, JsonObject(emptyMap()), emptyMap(), 1.0, null, labelTags)
        val readSource = if (source == Source.ON_DEVICE) "phone_on_device" else "phone_cloud"
        return s.copy(
            items = s.items + BoxItem(input, readSource, ms, null),
            onDeviceReads = s.onDeviceReads + if (source == Source.ON_DEVICE) 1 else 0,
            cloudReads = s.cloudReads + if (source == Source.IN_CLOUD) 1 else 0,
        )
    }

    fun answer(s: BoxState, itemId: String, questionId: String, answerId: String): BoxState = s.copy(
        items = s.items.map { if (it.input.itemId == itemId) it.copy(input = it.input.copy(answers = it.input.answers + (questionId to answerId))) else it },
    )

    /** A new destination; the box is re-checked by the rules alone, so no model is called. */
    fun setDestination(s: BoxState, code: String): BoxState =
        s.copy(destinationCode = code, rulesOnlyRechecks = s.rulesOnlyRechecks + if (s.items.isEmpty()) 0 else 1)

    fun withResult(s: BoxState, result: BoxResult): BoxState = s.copy(result = result, engineError = null)

    fun withEngineError(s: BoxState, name: String): BoxState = s.copy(result = null, engineError = name)

    /** The item as it may leave the phone: the label text stays here; its tags travel instead. */
    fun forSync(input: BoxItemInput): BoxItemInput = input.copy(read = input.read.copy(labelText = ""))
}

/** Holds the box and re-checks it through the engine after every change. */
class BoxController(initial: BoxState, private val engine: BoxEngine, private val today: () -> String) {
    var state: BoxState = initial
        private set

    private fun recheck() {
        state = try {
            if (state.items.isEmpty()) state.copy(result = null)
            else BoxLogic.withResult(state, engine.evaluate(state.items.map { it.input }, state.destinationCode, today()))
        } catch (e: EngineError) {
            BoxLogic.withEngineError(state, e.errorName)
        }
    }

    fun addRead(read: ItemReadWire, labelTags: List<String>, source: Source, ms: Long, newId: String) {
        state = BoxLogic.addRead(state, read, labelTags, source, ms, newId)
        recheck()
    }

    fun answer(itemId: String, questionId: String, answerId: String) {
        state = BoxLogic.answer(state, itemId, questionId, answerId)
        recheck()
    }

    fun setDestination(code: String) {
        state = BoxLogic.setDestination(state, code)
        recheck()
    }
}
