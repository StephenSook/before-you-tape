package app.beforeyoutape.android.data

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class BoxDocsContractTest {
    private val fixture = Json.parseToJsonElement(
        File(System.getProperty("byt.repoRoot")!!, "tests/contracts/box-docs.json").readText(),
    ).jsonObject

    /** A JSON value as Firestore hands it to Kotlin: whole numbers as Long, others as Double. */
    private fun firestore(e: JsonElement): Any? = when (e) {
        is JsonNull -> null
        is JsonPrimitive -> if (e.isString) e.content else e.booleanOrNull ?: e.longOrNull ?: e.content.toDouble()
        is JsonArray -> e.map(::firestore)
        is JsonObject -> e.mapValues { firestore(it.value) }
    }

    /** Numbers compared by value (Firestore keeps 0 and 0.0 apart; the rules take either for a read field). */
    private fun norm(v: Any?): Any? = when (v) {
        is Number -> v.toDouble()
        is List<*> -> v.map(::norm)
        is Map<*, *> -> v.mapValues { norm(it.value) }
        else -> v
    }

    @Suppress("UNCHECKED_CAST")
    private fun doc(key: String) = firestore(fixture.getValue(key).jsonObject.getValue("doc")) as Map<String, Any?>

    @Test fun theFixtureItemDecodesAndEncodesToTheSameDocument() {
        val d = doc("item")
        val item = BoxDocs.itemFromDoc(d.getValue("itemId") as String, d)
        assertEquals(norm(d), norm(BoxDocs.itemToDoc(item)))
        assertEquals(1L, BoxDocs.itemToDoc(item)["quantity"])
    }

    @Test fun theBoxFixtureDecodesAndEncodesToTheSameDocument() {
        val d = doc("box")
        val box = BoxDocs.boxFromDoc(d)
        assertEquals("CA", box.destinationCode)
        assertEquals(listOf("owner-uid"), box.memberUids)
        assertEquals(1, box.sources.onDevice)
        assertEquals(norm(d), norm(BoxDocs.boxToDoc(box)))
    }

    @Test fun anItemDocumentNeverCarriesLabelText() {
        val read = ItemReadWire("Lotion", ItemCategoryWire.lotion_cream, "SHEA LOTION 8 FL OZ", 0.0, 0.0, 0.0, 0.0,
            false, true, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)
        val s = BoxLogic.addRead(BoxLogic.empty("CA"), read, listOf("liquid"), Source.IN_CLOUD, 900, "i1")
        val local = BoxLogic.override(s, "i1", mapOf("labelText" to JsonPrimitive("TYPED LABEL")), listOf("liquid")).items.single()
        val d = BoxDocs.itemToDoc(local)
        @Suppress("UNCHECKED_CAST")
        assertEquals("", (d["read"] as Map<String, Any?>)["labelText"])
        @Suppress("UNCHECKED_CAST")
        assertTrue("labelText" !in (d["overrides"] as Map<String, Any?>))
        assertEquals(listOf("liquid"), d["labelTags"])
        assertEquals(900L, d["readMs"])
    }

    /** The web app times reads and re-checks with performance.now(), so both can be fractional. */
    @Test fun fractionalTimingsSurviveARoundTrip() {
        val item = doc("item").toMutableMap().apply { put("readMs", 1450.75) }
        assertEquals(1450.75, BoxDocs.itemToDoc(BoxDocs.itemFromDoc("item-1", item))["readMs"])
        val box = doc("box").toMutableMap().apply { put("lastRecheckMs", 12.375) }
        assertEquals(12.375, BoxDocs.boxToDoc(BoxDocs.boxFromDoc(box))["lastRecheckMs"])
    }

    @Test fun anUnknownReadSourceAndTheWebsExtraFieldsAreKept() {
        val d = doc("item").toMutableMap().apply { put("readSource", "cloud_unreported") }
        val back = BoxDocs.itemToDoc(BoxDocs.itemFromDoc("item-1", d))
        assertEquals("cloud_unreported", back["readSource"])
        assertEquals(norm(d["secondLook"]), norm(back["secondLook"]))
        assertEquals(norm(d["readFallback"]), norm(back["readFallback"]))
        assertEquals(norm(d["customs"]), norm(back["customs"]))
    }

    @Test fun aPhoneItemCarriesTheWebAppsDefaultsForTheFieldsItDoesNotUse() {
        val read = ItemReadWire("Phone", ItemCategoryWire.phone, "", 3.85, 4000.0, 15.4, 0.0,
            true, false, false, false, false, false, false, RetailBoxWire.sealed, EvidenceWire.item_seen)
        val item = BoxLogic.addRead(BoxLogic.empty("CA"), read, emptyList(), Source.ON_DEVICE, 300, "p").items.single()
        val d = BoxDocs.itemToDoc(item)
        assertEquals(null, d["secondLook"])
        assertEquals(null, d["cropKey"])
        val emptyCustoms = mapOf("description" to "", "lintOk" to false, "weightOz" to null, "valueUsd" to null, "countryOfOrigin" to null, "upc" to null)
        assertEquals(emptyCustoms, d["customs"])
        assertEquals(emptyCustoms.keys, (doc("item")["customs"] as Map<*, *>).keys)
        assertTrue("readFallback" !in d)
    }
}
