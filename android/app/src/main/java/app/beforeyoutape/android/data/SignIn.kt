package app.beforeyoutape.android.data

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await

/**
 * A Firebase Auth user for this phone: the current one, or one new anonymous one. Callers share a
 * single in-flight sign-in: two concurrent anonymous sign-ins would leave the app holding one uid
 * while Firebase writes as the other.
 */
class SignIn(private val current: () -> String?, private val anonymous: suspend () -> String, private val scope: CoroutineScope) {
    private val lock = Mutex()
    private var inFlight: Deferred<String>? = null

    /**
     * The signed-in uid; throws when sign-in fails. The one anonymous sign-in runs in [scope], not in
     * a caller: a caller cancelled while waiting (its screen closed) leaves it running, and the next
     * caller waits on that same sign-in instead of starting a second one. A failed sign-in is not
     * kept, so the next caller tries again.
     */
    suspend fun ensureSignedIn(): String {
        current()?.let { return it }
        val task = lock.withLock {
            current()?.let { return it }
            inFlight?.takeIf { it.isActive } ?: scope.async { anonymous() }.also { inFlight = it }
        }
        return task.await()
    }
}

/**
 * The app's one sign-in. Cloud AI Logic requests can require a Firebase Auth ID token, and the box
 * rules check the writer's uid, so app start, every read that can reach the cloud and every box
 * write use this same instance.
 */
val FirebaseSignIn = SignIn(
    current = { Firebase.auth.currentUser?.uid },
    anonymous = { requireNotNull(Firebase.auth.signInAnonymously().await().user?.uid) { "anonymous sign-in returned no user" } },
    scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
)
