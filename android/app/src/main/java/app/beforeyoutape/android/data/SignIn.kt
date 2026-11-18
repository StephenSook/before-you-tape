package app.beforeyoutape.android.data

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await

/**
 * A Firebase Auth user for this phone: the current one, or one new anonymous one. Calls are
 * serialized, so callers that arrive together share a single sign-in: two concurrent anonymous
 * sign-ins would leave the app holding one uid while Firebase writes as the other.
 */
class SignIn(private val current: () -> String?, private val anonymous: suspend () -> String) {
    private val lock = Mutex()

    /** The signed-in uid; throws when sign-in fails. */
    suspend fun ensureSignedIn(): String = lock.withLock { current() ?: anonymous() }
}

/**
 * The app's one sign-in. Cloud AI Logic requests can require a Firebase Auth ID token, and the box
 * rules check the writer's uid, so app start, every read that can reach the cloud and every box
 * write use this same instance.
 */
val FirebaseSignIn = SignIn(
    current = { Firebase.auth.currentUser?.uid },
    anonymous = { requireNotNull(Firebase.auth.signInAnonymously().await().user?.uid) { "anonymous sign-in returned no user" } },
)
