package app.beforeyoutape.engine

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.security.MessageDigest

/** An engine failure, named as the bridge names it (for example "NoEditionError", "InvalidReadError"). */
class EngineError(val errorName: String, message: String) : Exception(message)

/**
 * Runs the web app's rules bundle (scripts/build-embed.sh) and calls its JSON bridge. It refuses a
 * bundle whose SHA-256 differs from the build manifest. Arguments reach JavaScript only as JSON
 * string literals, never by pasting raw text into a script.
 */
class EngineHost(private val runtime: JsRuntime, bundle: String, expectedSha256: String) : AutoCloseable {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    init {
        val actual = MessageDigest.getInstance("SHA-256").digest(bundle.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        if (!actual.equals(expectedSha256, ignoreCase = true)) {
            runtime.close()
            throw EngineError("BundleMismatch", "the rules bundle's SHA-256 is $actual, not the manifest's $expectedSha256")
        }
        try {
            runtime.evaluate(bundle, "byt-engine.js")
        } catch (e: Exception) {
            runtime.close()
            throw EngineError("EngineStartFailed", e.message ?: e.javaClass.simpleName)
        }
        val version = runtime.evaluate("typeof BYT === 'object' ? String(BYT.BRIDGE_VERSION) : 'none'", "version")
        if (version != BRIDGE_VERSION.toString()) {
            runtime.close()
            throw EngineError("BridgeVersion", "the bundle's bridge version is $version, the app needs $BRIDGE_VERSION")
        }
    }

    private fun call(function: String, argument: String? = null): JsonElement {
        val literal = argument?.let { json.encodeToString(String.serializer(), it) } ?: ""
        val text = try {
            runtime.evaluate("BYT.$function($literal)", function)
        } catch (e: Exception) {
            throw EngineError("JsException", e.message ?: e.javaClass.simpleName)
        } ?: throw EngineError("NoReply", "$function returned nothing")
        val reply = json.parseToJsonElement(text).jsonObject
        if (reply["ok"]?.jsonPrimitive?.booleanOrNull == true) return reply["value"] ?: JsonNull
        val error = reply["error"]?.jsonObject
        throw EngineError(
            error?.get("name")?.jsonPrimitive?.content ?: "UnknownError",
            error?.get("message")?.jsonPrimitive?.content ?: "",
        )
    }

    fun setEdition(editionJson: String): EditionInfo = json.decodeFromJsonElement(EditionInfo.serializer(), call("setEdition", editionJson))

    fun canonicalEdition(): String = call("canonicalEdition").jsonPrimitive.content

    fun editionBodyCanonical(): String = call("editionBodyCanonical").jsonPrimitive.content

    fun evaluateBox(items: List<BoxItemInput>, code: String, today: String): BoxResult {
        val input = buildJsonObject {
            put("items", json.encodeToJsonElement(ListSerializer(BoxItemInput.serializer()), items))
            put("code", code)
            put("today", today)
        }
        return json.decodeFromJsonElement(BoxResult.serializer(), call("evaluateBoxJson", input.toString()))
    }

    /** The destination layer's hits for one item's facts (the facts object as the engine defines it). */
    fun destinationHits(facts: JsonObject, answers: Map<String, String>, code: String): List<RuleHit> {
        val input = buildJsonObject {
            put("facts", facts)
            put("answers", json.encodeToJsonElement(MapSerializer(String.serializer(), String.serializer()), answers))
            put("code", code)
        }
        return json.decodeFromJsonElement(ListSerializer(RuleHit.serializer()), call("destinationHitsJson", input.toString()))
    }

    fun labelTags(labelText: String): List<String> =
        json.decodeFromJsonElement(ListSerializer(String.serializer()), call("labelTagsJson", labelText))

    /** A model's reply checked by the web app's own parser; a bad reply is an EngineError("InvalidReadError"). */
    fun parseItemRead(text: String): ItemReadWire = json.decodeFromJsonElement(ItemReadWire.serializer(), call("parseItemReadJson", text))

    /**
     * The same parser, with the engine's tags for the reply's whole label: the read keeps clipped label text,
     * and the tags come from the text before the cut. Save these as the item's labelTags; never tag the
     * clipped text.
     */
    fun parseItemReadTagged(text: String): TaggedRead =
        json.decodeFromJsonElement(TaggedRead.serializer(), call("parseItemReadTaggedJson", text))

    fun itemReadContract(): ItemReadContract = json.decodeFromJsonElement(ItemReadContract.serializer(), call("itemReadContract"))

    override fun close() = runtime.close()

    companion object {
        const val BRIDGE_VERSION = 1
    }
}
