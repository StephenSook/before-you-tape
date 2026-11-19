package app.beforeyoutape.engine

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ItemReadWireTest {
    private val base = RepoFiles.obj("tests/vectors/defaults.json").getValue("baseRead").jsonObject

    private fun readWith(field: String, value: String) =
        Json.encodeToString(JsonObject.serializer(), JsonObject(base + (field to JsonPrimitive(value))))

    @Test fun everyEnumValueParsesInTheTsParser() {
        RepoFiles.host().use { host ->
            for (c in ItemCategoryWire.entries) assertEquals(c, host.parseItemRead(readWith("category", c.name)).category)
            for (r in RetailBoxWire.entries) assertEquals(r, host.parseItemRead(readWith("retailBox", r.name)).retailBox)
            for (e in EvidenceWire.entries) assertEquals(e, host.parseItemRead(readWith("evidence", e.name)).evidence)
            assertEquals(37, ItemCategoryWire.entries.size)
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Test fun theFieldNamesMatchTheTsContractInOrder() {
        RepoFiles.host().use { host ->
            val contract = host.itemReadContract()
            val d = ItemReadWire.serializer().descriptor
            assertEquals(contract.fields.map { it.name }, (0 until d.elementsCount).map { d.getElementName(it) })
            val values = contract.fields.associate { it.name to it.values }
            assertEquals(values["category"], ItemCategoryWire.entries.map { it.name })
            assertEquals(values["retailBox"], RetailBoxWire.entries.map { it.name })
            assertEquals(values["evidence"], EvidenceWire.entries.map { it.name })
            assertEquals(160, contract.labelTextMax)
        }
    }
}
