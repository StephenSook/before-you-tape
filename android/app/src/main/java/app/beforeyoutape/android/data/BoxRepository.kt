package app.beforeyoutape.android.data

import app.beforeyoutape.android.box.BoxItem
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/** A box just created: its id, and the expiry its items must carry. */
data class NewBox(val boxId: String, val expiresAt: BoxExpiry)

/** A box as Firestore holds it: its header and its items, as the members see them. */
data class BoxSnapshot(val boxId: String, val header: BoxHeader, val items: List<BoxItem>)

/**
 * The shared box in Firestore (boxes/{boxId} and its items), local first: only creating a box is
 * awaited (its items need it to exist); every other write is sent without waiting, and the
 * Firestore cache keeps it while the phone is offline.
 */
interface BoxRepository {
    suspend fun createBox(ownerUid: String, destinationCode: String, editionId: String): NewBox
    fun watch(boxId: String): Flow<BoxSnapshot>

    /** A full write of the item, carrying [boxExpiresAt] (the box's expiresAt, null for a box from before expiry). */
    fun putItem(boxId: String, item: BoxItem, boxExpiresAt: BoxExpiry?)
    fun removeItem(boxId: String, itemId: String)
    fun setDestination(boxId: String, code: String, recheckAtMs: Long)

    fun addCounts(boxId: String, onDevice: Int, inCloud: Int, rulesOnlyRechecks: Int)
}

/**
 * The writes the repository makes, by document path ("boxes/{id}/items/{itemId}"). Firestore's own
 * cache queues them while the phone is offline and sends them when the link returns; only [create]
 * is awaited.
 */
interface DocStore {
    suspend fun create(collection: String, data: Map<String, Any?>): String
    fun set(path: String, data: Map<String, Any?>)
    fun update(path: String, data: Map<String, Any?>)
    fun delete(path: String)
    fun serverTime(): Any
    fun increment(by: Long): Any
    fun timestamp(at: BoxExpiry): Any
}

class FirestoreDocStore : DocStore {
    private val db by lazy { Firebase.firestore }

    override suspend fun create(collection: String, data: Map<String, Any?>): String {
        val ref = db.collection(collection).document()
        ref.set(data).await()
        return ref.id
    }

    override fun set(path: String, data: Map<String, Any?>) { db.document(path).set(data) }
    override fun update(path: String, data: Map<String, Any?>) { db.document(path).update(data) }
    override fun delete(path: String) { db.document(path).delete() }
    override fun serverTime(): Any = FieldValue.serverTimestamp()
    override fun increment(by: Long): Any = FieldValue.increment(by)
    override fun timestamp(at: BoxExpiry): Any = Timestamp(at.seconds, at.nanos)
}

class FirestoreBoxRepository(
    private val store: DocStore = FirestoreDocStore(),
    private val nowMs: () -> Long = System::currentTimeMillis,
) : BoxRepository {
    private val db by lazy { Firebase.firestore }
    private fun box(id: String) = db.collection("boxes").document(id)

    // The rules take a box's expiresAt within a day of creation plus 37 days by the server's clock, so this phone's
    // clock is used for it; one off by more than a day has its box refused.
    override suspend fun createBox(ownerUid: String, destinationCode: String, editionId: String): NewBox {
        val expiresAt = BoxExpiry.fromCreation(nowMs())
        val doc = BoxDocs.newBoxDoc(ownerUid, destinationCode, editionId) +
            ("updatedAt" to store.serverTime()) + (BoxDocs.EXPIRES_AT to store.timestamp(expiresAt))
        return NewBox(store.create("boxes", doc), expiresAt)
    }

    // A set replaces the whole item, and the rules keep an item's expiresAt equal to its box's, so every write carries it.
    override fun putItem(boxId: String, item: BoxItem, boxExpiresAt: BoxExpiry?) {
        val expiry = boxExpiresAt?.let { mapOf(BoxDocs.EXPIRES_AT to store.timestamp(it)) }.orEmpty()
        store.set("boxes/$boxId/items/${item.input.itemId}", BoxDocs.itemToDoc(item) + expiry)
    }

    override fun removeItem(boxId: String, itemId: String) {
        store.delete("boxes/$boxId/items/$itemId")
    }

    override fun setDestination(boxId: String, code: String, recheckAtMs: Long) {
        store.update("boxes/$boxId", mapOf("destinationCode" to code, "lastRecheckMs" to recheckAtMs, "updatedAt" to store.serverTime()))
    }

    override fun addCounts(boxId: String, onDevice: Int, inCloud: Int, rulesOnlyRechecks: Int) {
        val changes = buildMap<String, Any?> {
            if (onDevice > 0) put("sources.onDevice", store.increment(onDevice.toLong()))
            if (inCloud > 0) put("sources.inCloud", store.increment(inCloud.toLong()))
            if (rulesOnlyRechecks > 0) put("sources.rulesOnlyRechecks", store.increment(rulesOnlyRechecks.toLong()))
        }
        if (changes.isNotEmpty()) store.update("boxes/$boxId", changes + ("updatedAt" to store.serverTime()))
    }

    override fun watch(boxId: String): Flow<BoxSnapshot> = callbackFlow {
        var header: BoxHeader? = null
        var items: List<BoxItem> = emptyList()
        fun emit() { header?.let { trySend(BoxSnapshot(boxId, it, items)) } }
        val regs = mutableListOf<ListenerRegistration>()
        regs += box(boxId).addSnapshotListener { snap, err ->
            if (err != null) { close(err); return@addSnapshotListener }
            val data = snap?.data ?: return@addSnapshotListener
            val expiresAt = (data[BoxDocs.EXPIRES_AT] as? Timestamp)?.let { BoxExpiry(it.seconds, it.nanoseconds) }
            header = runCatching { BoxDocs.boxFromDoc(data, expiresAt) }.getOrNull()
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
