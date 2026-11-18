package app.beforeyoutape.engine

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Runs the shared vectors the way the TypeScript engine tests do, and reports each mismatch instead of stopping. */
object Vectors {
    private val json = Json { ignoreUnknownKeys = true }
    private val defaults = RepoFiles.obj("tests/vectors/defaults.json")
    val box: List<JsonObject> = RepoFiles.array("tests/vectors/box.json").map { it.jsonObject }
    val guards: List<JsonObject> = RepoFiles.array("tests/vectors/box-guards.json").map { it.jsonObject }
    val destinations: List<JsonObject> = RepoFiles.array("tests/vectors/destinations.json").map { it.jsonObject }

    /** A vector item with the shared defaults filled in, decoded into the app's own type. */
    fun item(spec: JsonObject): BoxItemInput {
        val read = JsonObject(defaults.getValue("baseRead").jsonObject + (spec["read"]?.jsonObject ?: JsonObject(emptyMap())))
        val merged = JsonObject(defaults.getValue("itemDefaults").jsonObject + spec + ("read" to read))
        return json.decodeFromJsonElement(BoxItemInput.serializer(), merged)
    }

    private fun strings(e: JsonArray) = e.map { it.jsonPrimitive.content }

    /** Every place a box or guard vector's expectation is not met, as "name item: what". */
    fun checkBox(host: EngineHost, v: JsonObject): List<String> {
        val name = v.getValue("name").jsonPrimitive.content
        val items = v.getValue("items").jsonArray.map { item(it.jsonObject) }
        val r = host.evaluateBox(items, v.getValue("code").jsonPrimitive.content, v.getValue("today").jsonPrimitive.content)
        val out = mutableListOf<String>()
        for ((id, level) in v.getValue("expect").jsonObject) {
            val got = r.items[id]?.level?.name
            if (got != level.jsonPrimitive.content) out += "$name $id: level $got, expected ${level.jsonPrimitive.content}"
        }
        v["expectRules"]?.jsonObject?.forEach { (id, ids) ->
            val hits = r.items[id]?.hits?.map { it.ruleId }.orEmpty()
            val missing = strings(ids.jsonArray) - hits.toSet()
            if (missing.isNotEmpty()) out += "$name $id: missing rules $missing"
        }
        v["notRules"]?.jsonObject?.forEach { (id, ids) ->
            val hits = r.items[id]?.hits?.map { it.ruleId }.orEmpty()
            val present = strings(ids.jsonArray).filter { it in hits }
            if (present.isNotEmpty()) out += "$name $id: has rules it must not $present"
        }
        v["expectLithium"]?.jsonPrimitive?.content?.let { if (r.lithium.status != it) out += "$name: lithium ${r.lithium.status}, expected $it" }
        v["expectQuestion"]?.jsonObject?.forEach { (id, q) ->
            val got = r.items[id]?.question?.id
            if (got != q.jsonPrimitive.content) out += "$name $id: question $got, expected ${q.jsonPrimitive.content}"
        }
        return out
    }

    /** The mismatch for one destination vector, or null. */
    fun checkDestination(host: EngineHost, v: JsonObject): String? {
        val facts = JsonObject(defaults.getValue("baseFacts").jsonObject + ("tags" to v.getValue("tags")))
        val got = host.destinationHits(facts, emptyMap(), v.getValue("code").jsonPrimitive.content).map { it.ruleId to it.level }
        val want = v.getValue("expect").jsonArray.map { it.jsonObject.getValue("ruleId").jsonPrimitive.content to it.jsonObject.getValue("level").jsonPrimitive.content }
        return if (got == want) null else "${v.getValue("name").jsonPrimitive.content}: hits $got, expected $want"
    }
}
