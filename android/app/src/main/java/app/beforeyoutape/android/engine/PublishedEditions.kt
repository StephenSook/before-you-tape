package app.beforeyoutape.android.engine

import app.beforeyoutape.android.data.FirebaseSignIn
import com.google.firebase.Firebase
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.tasks.await

/**
 * A published rules edition lives at ruleEditions/{id} as { editionId, json, sha256 }, where json is
 * the edition's canonical JSON text, so Firestore's types never change the bytes the hash covers.
 * Signed-in users may read it. Missing: null; a field of the wrong type throws.
 */
object PublishedEditions {
    suspend fun fetch(id: String): String? {
        FirebaseSignIn.ensureSignedIn()
        val snap = Firebase.firestore.collection("ruleEditions").document(id).get().await()
        return if (snap.exists()) snap.getString("json") else null
    }
}
