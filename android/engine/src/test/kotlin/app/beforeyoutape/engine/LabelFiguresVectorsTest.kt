package app.beforeyoutape.engine

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * tests/vectors/labelFigures.json through this app's engine (QuickJS): the figures an item keeps come from the
 * engine's own parser, never one written again in Kotlin. Every case runs, and a failure names each case that differs.
 */
class LabelFiguresVectorsTest {
    @Test fun everyLabelFiguresVectorGivesItsFigures() {
        val cases = RepoFiles.array("tests/vectors/labelFigures.json").map { it.jsonObject }
        assertTrue("label figure vectors: ${cases.size}", cases.size >= 10)
        val differ = RepoFiles.host().use { host ->
            cases.mapNotNull { c ->
                val name = c.getValue("name").jsonPrimitive.content
                val texts = c.getValue("texts").jsonArray.map { it.jsonPrimitive.content }
                val kept = c["kept"]?.let { Json.decodeFromJsonElement(LabelFigures.serializer(), it) }
                val expect = c.getValue("expect").let { if (it is JsonNull) null else Json.decodeFromJsonElement(LabelFigures.serializer(), it) }
                val got = host.labelFigures(texts, kept)
                if (got == expect) null else "$name: want $expect, got $got"
            }
        }
        assertEquals("cases that differ:\n${differ.joinToString("\n")}", emptyList<String>(), differ)
    }

    /**
     * An item as a sync reloads it (its read carries no label text) still holds on its label's figures when it keeps
     * them, and only then: the figures are what keeps DATA-LABEL-NUMBERS after a reload.
     */
    @Test fun aReloadedItemStillHoldsOnItsKeptFigures() {
        RepoFiles.host().use { host ->
            val base = RepoFiles.obj("tests/vectors/defaults.json").getValue("baseRead").jsonObject
            val full = "LI-ION 3.85V 4000mAh 15.4Wh PACK 154Wh"
            val read = host.parseItemRead(Json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), kotlinx.serialization.json.JsonObject(base + mapOf(
                "itemName" to kotlinx.serialization.json.JsonPrimitive("Phone"), "category" to kotlinx.serialization.json.JsonPrimitive("phone"),
                "labelText" to kotlinx.serialization.json.JsonPrimitive(full), "volts" to kotlinx.serialization.json.JsonPrimitive(3.85),
                "milliampHours" to kotlinx.serialization.json.JsonPrimitive(4000), "wattHours" to kotlinx.serialization.json.JsonPrimitive(15.4),
                "batteryWords" to kotlinx.serialization.json.JsonPrimitive(true), "evidence" to kotlinx.serialization.json.JsonPrimitive("label_read")))))
            val figures = host.labelFigures(listOf(full))
            assertEquals(listOf(154.0, 15.4), figures?.wh)
            val reloaded = BoxItemInput("p", read.copy(labelText = ""), kotlinx.serialization.json.JsonObject(emptyMap()), emptyMap(), 1.0, null,
                host.labelTags(full), labelFigures = figures)
            fun rules(i: BoxItemInput) = host.evaluateBox(listOf(i), "CA", "2026-11-20").items.getValue("p").hits.map { it.ruleId }
            assertTrue("DATA-LABEL-NUMBERS" in rules(reloaded))
            assertTrue("DATA-LABEL-NUMBERS" !in rules(reloaded.copy(labelFigures = null)))
        }
    }

    /** The check above can fail: a case with a figure it does not give is reported. */
    @Test fun aWrongExpectationIsReported() {
        RepoFiles.host().use { host ->
            val got = host.labelFigures(listOf("LI-ION 3.85V 15.4Wh"))
            assertEquals(LabelFigures(wh = listOf(15.4), grams = emptyList()), got)
            assertTrue(got != LabelFigures(wh = listOf(154.0), grams = emptyList()))
        }
    }
}
