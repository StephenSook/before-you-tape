package app.beforeyoutape.android.data

import app.beforeyoutape.android.box.BoxItem
import com.google.firebase.Firebase
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/** A box as Firestore holds it: its header and its items, as the members see them. */
data class BoxSnapshot(val boxId: String, val header: BoxHeader, val items: List<BoxItem>)

/**
 * The shared box in Firestore (boxes/{boxId} and its items), local first: only creating a box is
 * awaited (its items need it to exist); every other write is sent without waiting, and the
 * Firestore cache keeps it while the phone is offline.
 */
interface BoxRepository {
    suspend fun createBox(ownerUid: String, destinationCode: String, editionId: String): String
    fun watch(boxId: String): Flow<BoxSnapshot>
    fun putItem(boxId: String, item: BoxItem)
    fun removeItem(boxId: String, itemId: String)
    fun setDestination(boxId: String, code: String, recheckAtMs: Long)

    fun addCounts(boxId: String, onDevice: Int, inCloud: Int, rulesOnlyRechecks: Int)
}

class FirestoreBoxRepository : BoxRepository {
    private val db = Firebase.firestore
    private fun box(id: String) = db.collection("boxes").document(id)

    override suspend fun createBox(ownerUid: String, destinationCode: String, editionId: String): String {
        val ref = db.collection("boxes").document()
        ref.set(BoxDocs.newBoxDoc(ownerUid, destinationCode, editionId) + ("updatedAt" to FieldValue.serverTimestamp())).await()
        return ref.id
    }

    override fun putItem(boxId: String, item: BoxItem) {
        box(boxId).collection("items").document(item.input.itemId).set(BoxDocs.itemToDoc(item))
    }

    override fun removeItem(boxId: String, itemId: String) {
        box(boxId).collection("items").document(itemId).delete()
    }

    override fun setDestination(boxId: String, code: String, recheckAtMs: Long) {
        box(boxId).update(mapOf("destinationCode" to code, "lastRecheckMs" to recheckAtMs, "updatedAt" to FieldValue.serverTimestamp()))
    }

    override fun addCounts(boxId: String, onDevice: Int, inCloud: Int, rulesOnlyRechecks: Int) {
        val changes = buildMap<String, Any> {
            if (onDevice > 0) put("sources.onDevice", FieldValue.increment(onDevice.toLong()))
            if (inCloud > 0) put("sources.inCloud", FieldValue.increment(inCloud.toLong()))
            if (rulesOnlyRechecks > 0) put("sources.rulesOnlyRechecks", FieldValue.increment(rulesOnlyRechecks.toLong()))
        }
        if (changes.isNotEmpty()) box(boxId).update(changes + ("updatedAt" to FieldValue.serverTimestamp()))
    }

    override fun watch(boxId: String): Flow<BoxSnapshot> = callbackFlow {
        var header: BoxHeader? = null
        var items: List<BoxItem> = emptyList()
        fun emit() { header?.let { trySend(BoxSnapshot(boxId, it, items)) } }
        val regs = mutableListOf<ListenerRegistration>()
        regs += box(boxId).addSnapshotListener { snap, err ->
            if (err != null) { close(err); return@addSnapshotListener }
            val data = snap?.data ?: return@addSnapshotListener
            header = runCatching { BoxDocs.boxFromDoc(data) }.getOrNull()
            emit()
        }
        regs += box(boxId).collection("items").addSnapshotListener { snap, err ->
            if (err != null) { close(err); return@addSnapshotListener }
            items = BoxDocs.sortedForListing(
                snap?.documents.orEmpty().mapNotNull { d -> d.data?.let { runCatching { BoxDocs.itemFromDoc(d.id, it) }.getOrNull() } },
            )
            emit()
        }
        awaitClose { regs.forEach { it.remove() } }
    }
}
