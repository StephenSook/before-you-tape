package app.beforeyoutape.android.data

import app.beforeyoutape.android.box.BoxItem
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.android.box.BoxState
import app.beforeyoutape.engine.BoxItemInput
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The active box, kept in app-private storage so it survives Android stopping the app's process.
 * It holds what the phone holds, label text included (label text never leaves the phone, but it
 * may stay on it). Verdicts are not kept: they are recomputed from the items on restore.
 */
class BoxPersistence(private val prefs: Prefs) {
    fun save(s: BoxState) = prefs.put(KEY, encode(s).toString())

    /** The saved box, or null when there is none or it cannot be read (then the box starts empty). */
    fun load(): BoxState? = prefs.get(KEY)?.let { text -> runCatching { decode(Json.parseToJsonElement(text).jsonObject) }.getOrNull() }

    private fun encode(s: BoxState) = JsonObject(
        mapOf(
            "v" to JsonPrimitive(1),
            "boxId" to (s.boxId?.let(::JsonPrimitive) ?: JsonNull),
            "destinationCode" to JsonPrimitive(s.destinationCode),
            "cloudConsent" to (s.cloudConsent?.let(::JsonPrimitive) ?: JsonNull),
            "onDeviceReads" to JsonPrimitive(s.onDeviceReads),
            "cloudReads" to JsonPrimitive(s.cloudReads),
            "rulesOnlyRechecks" to JsonPrimitive(s.rulesOnlyRechecks),
            "items" to JsonArray(
                s.items.map { item ->
                    JsonObject(
                        mapOf(
                            "input" to Json.encodeToJsonElement(BoxItemInput.serializer(), item.input),
                            "readSource" to JsonPrimitive(item.readSource),
                            "readMs" to JsonPrimitive(item.readMs),
                            "cropFile" to (item.cropFile?.let(::JsonPrimitive) ?: JsonNull),
                            "extras" to BoxDocs.toJson(item.extras),
                            "tagsEdition" to (item.tagsEdition?.let(::JsonPrimitive) ?: JsonNull),
                        ),
                    )
                },
            ),
        ),
    )

    @Suppress("UNCHECKED_CAST")
    private fun decode(o: JsonObject): BoxState {
        require(o.getValue("v").jsonPrimitive.int == 1) { "unknown saved box version" }
        fun str(k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
        return BoxState(
            boxId = str("boxId"),
            destinationCode = o.getValue("destinationCode").jsonPrimitive.content,
            items = o.getValue("items").jsonArray.map { e ->
                val i = e.jsonObject
                val readSource = i.getValue("readSource").jsonPrimitive.content
                BoxItem(
                    // A box saved before numbersFrom was kept: a typed item says "typed" again.
                    input = BoxLogic.withNumbersFrom(Json.decodeFromJsonElement(BoxItemInput.serializer(), i.getValue("input")), readSource),
                    readSource = readSource,
                    readMs = i.getValue("readMs").jsonPrimitive.double,
                    cropFile = (i["cropFile"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
                    extras = (BoxDocs.fromJson(i.getValue("extras")) as? Map<String, Any?>) ?: emptyMap(),
                    // Absent in a box saved before the edition was kept: unknown.
                    tagsEdition = (i["tagsEdition"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
                )
            },
            result = null,
            cloudConsent = (o["cloudConsent"] as? JsonPrimitive)?.booleanOrNull,
            onDeviceReads = o.getValue("onDeviceReads").jsonPrimitive.int,
            cloudReads = o.getValue("cloudReads").jsonPrimitive.int,
            rulesOnlyRechecks = o.getValue("rulesOnlyRechecks").jsonPrimitive.int,
            engineError = null,
        )
    }

    private companion object {
        const val KEY = "active_box"
    }
}
