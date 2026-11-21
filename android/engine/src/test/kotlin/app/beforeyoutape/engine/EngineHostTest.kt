package app.beforeyoutape.engine

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineHostTest {
    @Test fun aBundleWithOneChangedByteIsRefused() {
        val bundle = RepoFiles.bundle
        val i = bundle.indexOf("BRIDGE_VERSION")
        val changed = bundle.substring(0, i) + "X" + bundle.substring(i + 1)
        val e = assertThrows(EngineError::class.java) { EngineHost(QuickJsTestRuntime(), changed, RepoFiles.bundleSha256) }
        assertEquals("BundleMismatch", e.errorName)
    }

    @Test fun anErrorReplyBecomesAnEngineError() {
        RepoFiles.host().use { host ->
            val e = assertThrows(EngineError::class.java) { host.parseItemRead("not json") }
            assertEquals("InvalidReadError", e.errorName)
        }
    }

    @Test fun evaluateBeforeAnEditionFailsClosed() {
        EngineHost(QuickJsTestRuntime(), RepoFiles.bundle, RepoFiles.bundleSha256).use { host ->
            val item = Vectors.item(Vectors.box.first().getValue("items").let { (it as kotlinx.serialization.json.JsonArray).first().jsonObject })
            val e = assertThrows(EngineError::class.java) { host.evaluateBox(listOf(item), "CA", "2026-11-20") }
            assertEquals("NoEditionError", e.errorName)
        }
    }

    /** A read's tags come from its whole label, before the parser clips the text it keeps: a hazard word
     *  past the cap counts, and a cut that ends "FLAMMABLE-FREE" at "FLAMMABLE" never makes one. */
    @Test fun aParsedReadIsTaggedFromItsWholeLabel() {
        RepoFiles.host().use { host ->
            val base = RepoFiles.obj("tests/vectors/defaults.json").getValue("baseRead").jsonObject
            fun parsed(label: String): TaggedRead {
                val read = kotlinx.serialization.json.JsonObject(base + mapOf(
                    "itemName" to JsonPrimitive("Lotion"), "category" to JsonPrimitive("lotion_cream"), "liquid" to JsonPrimitive(true),
                    "retailBox" to JsonPrimitive("sealed"), "evidence" to JsonPrimitive("label_read"), "labelText" to JsonPrimitive(label)))
                return host.parseItemReadTagged(Json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), read))
            }
            fun level(p: TaggedRead): String {
                val item = BoxItemInput("a", p.read, kotlinx.serialization.json.JsonObject(emptyMap()), emptyMap(), 1.0, null, p.labelTags)
                return host.evaluateBox(listOf(item), "CA", "2026-11-20").items.getValue("a").level.name
            }
            // The same lotion with no hazard word is OK, so the checks below are not vacuous.
            assertEquals("ok", level(parsed("x".repeat(155) + " LOTION")))
            val past = parsed("x".repeat(155) + " FLAMMABLE")
            assertEquals(160, past.read.labelText.codePointCount(0, past.read.labelText.length))
            assertTrue("tags ${past.labelTags}", past.labelTags.containsAll(listOf("flammable", "label_text")))
            assertTrue(level(past) != "ok")
            val cut = parsed("x".repeat(150) + " FLAMMABLE-FREE LOTION")
            assertTrue(cut.read.labelText.endsWith("FLAMMABLE"))
            assertTrue("tags ${cut.labelTags}", "flammable" !in cut.labelTags)
            assertEquals("ok", level(cut))
        }
    }

    @Test fun aLabelWithQuotesBackslashesAndLineSeparatorsRoundTrips() {
        val label = "PERFUME \"EAU\" 50 ml\\n\nALCOHOL </script>"
        RepoFiles.host().use { host ->
            val base = RepoFiles.obj("tests/vectors/defaults.json").getValue("baseRead").jsonObject
            val read = Json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), kotlinx.serialization.json.JsonObject(base + ("labelText" to JsonPrimitive(label))))
            assertEquals(label, host.parseItemRead(read).labelText)
            val tags = host.labelTags(label)
            assertEquals(tags, host.labelTags(label.replace(" ", " ")))
            assertTrue("tags $tags", tags.isNotEmpty())
        }
    }
}
