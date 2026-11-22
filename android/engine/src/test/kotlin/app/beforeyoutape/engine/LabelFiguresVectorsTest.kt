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

    /** The check above can fail: a case with a figure it does not give is reported. */
    @Test fun aWrongExpectationIsReported() {
        RepoFiles.host().use { host ->
            val got = host.labelFigures(listOf("LI-ION 3.85V 15.4Wh"))
            assertEquals(LabelFigures(wh = listOf(15.4), grams = emptyList()), got)
            assertTrue(got != LabelFigures(wh = listOf(154.0), grams = emptyList()))
        }
    }
}
