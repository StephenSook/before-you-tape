package app.beforeyoutape.android.data

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import kotlinx.coroutines.tasks.await

/**
 * A Firebase Auth user for this phone: the current one, or a new anonymous one. Cloud AI Logic
 * requests can require a Firebase Auth ID token, so every read that can reach the cloud awaits
 * this first. Throws when sign-in fails.
 */
object FirebaseSignIn {
    suspend fun ensureSignedIn(): String {
        val auth = Firebase.auth
        val user = auth.currentUser ?: auth.signInAnonymously().await().user
        return requireNotNull(user?.uid) { "anonymous sign-in returned no user" }
    }
}
