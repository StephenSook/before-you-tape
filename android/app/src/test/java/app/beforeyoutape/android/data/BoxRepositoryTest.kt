package app.beforeyoutape.android.data

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BoxRepositoryTest {
    /** A store like Firestore's cache: writes made offline wait in a queue and go out when the link returns. */
    private class QueueStore : DocStore {
        var online = false
        val queue = mutableListOf<Pair<String, Map<String, Any?>?>>()
        val server = mutableMapOf<String, Map<String, Any?>>()

        private fun send(path: String, data: Map<String, Any?>?) {
            queue += path to data
            if (online) flush()
        }

        fun flush() {
            for ((path, data) in queue) if (data == null) server.remove(path) else server[path] = (server[path].orEmpty() + data)
            queue.clear()
        }

        override suspend fun create(collection: String, data: Map<String, Any?>): String = "box-1".also { server["$collection/$it"] = data }
        override fun set(path: String, data: Map<String, Any?>) = send(path, data)
        override fun update(path: String, data: Map<String, Any?>) = send(path, data)
        override fun delete(path: String) = send(path, null)
        override fun serverTime(): Any = "SERVER_TIME"
        override fun increment(by: Long): Any = "+$by"
    }

    private val read = ItemReadWire("Brand X power bank", ItemCategoryWire.power_bank, "20000mAh 74Wh", 3.7, 20000.0, 74.0, 0.0,
        true, false, false, false, false, false, false, RetailBoxWire.sealed, EvidenceWire.label_read)

    @Test fun anItemReadOfflineIsSentWhenTheLinkReturns() = runTest {
        val store = QueueStore()
        val repo = FirestoreBoxRepository(store)
        val item = BoxLogic.addRead(BoxLogic.empty("CA"), read, listOf("li_ion"), Source.IN_CLOUD, 900, "i1").items.single()

        repo.putItem("box-1", item)
        assertTrue("nothing reaches the server while offline", "boxes/box-1/items/i1" !in store.server)
        assertEquals(1, store.queue.size)

        store.online = true
        store.flush()
        val sent = store.server.getValue("boxes/box-1/items/i1")
        @Suppress("UNCHECKED_CAST")
        val sentRead = sent["read"] as Map<String, Any?>
        assertEquals("", sentRead["labelText"])
        assertEquals("Power bank", sentRead["itemName"])
    }

    @Test fun aNewBoxIsCreatedWithNoConsentAndTheServerTime() = runTest {
        val store = QueueStore()
        val id = FirestoreBoxRepository(store).createBox("owner-uid", "CA", "byt-e1")
        val doc = store.server.getValue("boxes/$id")
        assertTrue("cloudConsent" !in doc)
        assertEquals("SERVER_TIME", doc["updatedAt"])
    }

    @Test fun countsAreSentAsIncrementsOfOnlyWhatChanged() {
        val store = QueueStore().apply { online = true }
        FirestoreBoxRepository(store).addCounts("box-1", onDevice = 0, inCloud = 2, rulesOnlyRechecks = 0)
        assertEquals(mapOf("sources.inCloud" to "+2", "updatedAt" to "SERVER_TIME"), store.server.getValue("boxes/box-1"))
    }
}
