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
