package app.beforeyoutape.android.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.android.data.FirebaseSignIn
import app.beforeyoutape.android.data.FirestoreBoxRepository
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.Source as DocSource
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

/** Live, run on request: the box documents against the deployed Firestore rules. Logs BYT-PROBE lines with outcomes only. */
@Live
@RunWith(AndroidJUnit4::class)
class BoxLiveTest {
    private fun log(s: String) = Log.i("BYT-PROBE", s)
    private val read = ItemReadWire("Lotion", ItemCategoryWire.lotion_cream, "SHEA LOTION 8 FL OZ", 0.0, 0.0, 0.0, 0.0,
        false, true, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)

    private suspend fun signInFresh(): String {
        Firebase.auth.signOut()
        return Firebase.auth.signInAnonymously().await().user!!.uid
    }

    @Test fun aBoxMadeOnThePhoneCanBeReadBackAndAStrangerIsRefused(): Unit = runBlocking {
        // The app's one shared sign-in (app start uses it too), so no second anonymous user can race it.
        val owner = withTimeout(30_000) { FirebaseSignIn.ensureSignedIn() }
        val repo = FirestoreBoxRepository()
        log("step: create box")
        val boxId = repo.createBox(owner, "CA", "byt-live-test", true)
        log("step: box created")
        val item = BoxLogic.addRead(BoxLogic.empty("CA"), read, listOf("label_text"), Source.IN_CLOUD, 900, "live-item-1").items.single()
        // An item written while offline waits in the Firestore cache and is sent when the link returns.
        Firebase.firestore.disableNetwork().await()
        repo.putItem(boxId, item)
        Firebase.firestore.enableNetwork().await()
        log("step: watch for the item")
        val snap = withTimeout(30_000) { repo.watch(boxId).first { s -> s.items.any { it.input.itemId == "live-item-1" } } }
        log("step: server read of the item")
        val server = Firebase.firestore.collection("boxes").document(boxId).collection("items").document("live-item-1").get(DocSource.SERVER).await()
        @Suppress("UNCHECKED_CAST")
        assertEquals("", (server.get("read") as Map<String, Any?>)["labelText"])
        assertEquals(1L, server.getLong("quantity"))
        assertEquals(listOf(owner), snap.header.memberUids)
        log("box made on the phone; an item written offline reached the server with no label text")

        log("step: set destination")
        repo.setDestination(boxId, "PH", System.currentTimeMillis())
        withTimeout(30_000) { repo.watch(boxId).first { it.header.destinationCode == "PH" } }
        log("destination change accepted")

        signInFresh()
        try {
            Firebase.firestore.collection("boxes").document(boxId).get(DocSource.SERVER).await()
            fail("a stranger read the box")
        } catch (e: FirebaseFirestoreException) {
            assertTrue(e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED)
            log("a stranger is refused the box (${e.code})")
        }
    }
}
