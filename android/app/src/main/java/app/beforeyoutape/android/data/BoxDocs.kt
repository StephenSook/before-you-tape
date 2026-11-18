package app.beforeyoutape.android.data

import app.beforeyoutape.android.box.BoxItem
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.ItemReadWire
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/** The box's counts of where reads ran, as the web app keeps them. */
data class BoxSources(val onDevice: Int, val inCloud: Int, val secondLooks: Int, val rulesOnlyRechecks: Int, val cloudFallbacks: Int)

/** The box document (boxes/{boxId}), without its items. */
data class BoxHeader(
    val ownerUid: String,
    val memberUids: List<String>,
    val joinKeyHash: String,
    val destinationCode: String,
    val editionId: String,
    val cloudConsent: Boolean?,
    val sources: BoxSources,
    val lastRecheckMs: Long?,
)

/**
 * The web app's box and item documents (tests/contracts/box-docs.json), as Firestore values:
 * strings, booleans, Long, Double, lists, maps and null. An item never carries label text, read
 * or typed; its tags travel instead.
 */
object BoxDocs {
    private val EXTRA_KEYS = listOf("secondLook", "readFallback", "cropKey", "customs", "addedAt")
    private val EMPTY_CUSTOMS: Map<String, Any?> =
        linkedMapOf("description" to "", "lintOk" to false, "weightOz" to null, "valueUsd" to null, "countryOfOrigin" to null, "upc" to null)

    /** A Firestore value as JSON. */
    fun toJson(v: Any?): JsonElement = when (v) {
        null -> JsonNull
        is String -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is List<*> -> JsonArray(v.map(::toJson))
        is Map<*, *> -> JsonObject(v.entries.associate { (k, x) -> k as String to toJson(x) })
        else -> throw IllegalArgumentException("not a document value: ${v::class.simpleName}")
    }

    /** JSON as a Firestore value: whole numbers as Long, others as Double. */
    fun fromJson(e: JsonElement): Any? = when (e) {
        is JsonNull -> null
        is JsonPrimitive -> if (e.isString) e.content else e.booleanOrNull ?: e.longOrNull ?: e.doubleOrNull
        is JsonArray -> e.map(::fromJson)
        is JsonObject -> e.mapValues { fromJson(it.value) }
    }

    @Suppress("UNCHECKED_CAST")
    private fun map(v: Any?): Map<String, Any?> = (v as? Map<String, Any?>) ?: emptyMap()

    fun itemToDoc(item: BoxItem): Map<String, Any?> {
        val input = BoxLogic.forSync(item.input)
        val doc = linkedMapOf<String, Any?>(
            "itemId" to input.itemId,
            "read" to fromJson(Json.encodeToJsonElement(ItemReadWire.serializer(), input.read)),
            "overrides" to fromJson(input.overrides),
            "answers" to input.answers,
            "quantity" to Math.round(input.quantity),
            "identityConfirmedBy" to input.identityConfirmedBy,
            "labelTags" to input.labelTags,
            "readSource" to item.readSource,
            "readMs" to item.readMs,
            "secondLook" to item.extras["secondLook"],
        )
        if ("readFallback" in item.extras) doc["readFallback"] = item.extras["readFallback"]
        doc["cropKey"] = item.extras["cropKey"]
        doc["customs"] = item.extras["customs"] ?: EMPTY_CUSTOMS
        // The web app stamps addedAt (ms since 1970) on new items; kept as it came.
        if ("addedAt" in item.extras) doc["addedAt"] = item.extras["addedAt"]
        return doc
    }

    fun itemFromDoc(id: String, doc: Map<String, Any?>): BoxItem {
        val read = Json.decodeFromJsonElement(ItemReadWire.serializer(), toJson(doc["read"]).jsonObject)
        val input = BoxItemInput(
            itemId = doc["itemId"] as? String ?: id,
            read = read,
            overrides = toJson(map(doc["overrides"])).jsonObject,
            answers = map(doc["answers"]).mapValues { it.value as String },
            quantity = (doc["quantity"] as Number).toDouble(),
            identityConfirmedBy = doc["identityConfirmedBy"] as String?,
            labelTags = (doc["labelTags"] as List<*>).map { it as String },
        )
        val extras = EXTRA_KEYS.filter { it in doc }.associateWith { doc[it] }
        return BoxItem(input, doc["readSource"] as String, (doc["readMs"] as? Number)?.toLong() ?: 0L, null, extras)
    }

    /**
     * A box's items in the order to show them: oldest first by addedAt, then the items with no
     * addedAt in the order the server gave them (the server returns items by their random ids).
     */
    fun sortedForListing(items: List<BoxItem>): List<BoxItem> {
        fun at(i: BoxItem) = (i.extras["addedAt"] as? Number)?.toLong()?.takeIf { it > 0 }
        val (dated, undated) = items.partition { at(it) != null }
        return dated.sortedBy { at(it) } + undated
    }

    fun boxToDoc(h: BoxHeader): Map<String, Any?> = linkedMapOf(
        "ownerUid" to h.ownerUid,
        "memberUids" to h.memberUids,
        "joinKeyHash" to h.joinKeyHash,
        "destinationCode" to h.destinationCode,
        "editionId" to h.editionId,
        "cloudConsent" to h.cloudConsent,
        "sources" to linkedMapOf(
            "onDevice" to h.sources.onDevice.toLong(), "inCloud" to h.sources.inCloud.toLong(),
            "secondLooks" to h.sources.secondLooks.toLong(), "rulesOnlyRechecks" to h.sources.rulesOnlyRechecks.toLong(),
            "cloudFallbacks" to h.sources.cloudFallbacks.toLong(),
        ),
        "lastRecheckMs" to h.lastRecheckMs,
    )

    fun boxFromDoc(doc: Map<String, Any?>): BoxHeader {
        val s = map(doc["sources"])
        fun count(k: String) = (s[k] as? Number)?.toInt() ?: 0
        return BoxHeader(
            ownerUid = doc["ownerUid"] as String,
            memberUids = (doc["memberUids"] as List<*>).map { it as String },
            joinKeyHash = doc["joinKeyHash"] as? String ?: "",
            destinationCode = doc["destinationCode"] as String,
            editionId = doc["editionId"] as String,
            cloudConsent = doc["cloudConsent"] as Boolean?,
            sources = BoxSources(count("onDevice"), count("inCloud"), count("secondLooks"), count("rulesOnlyRechecks"), count("cloudFallbacks")),
            lastRecheckMs = (doc["lastRecheckMs"] as? Number)?.toLong(),
        )
    }
}
