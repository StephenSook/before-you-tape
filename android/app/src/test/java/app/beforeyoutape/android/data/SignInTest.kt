package app.beforeyoutape.android.data

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Test

class SignInTest {
    /** A fake Auth: no user until the one anonymous sign-in completes. */
    private class FakeAuth {
        var user: String? = null
        var signIns = 0
        val release = CompletableDeferred<Unit>()
        suspend fun signInAnonymously(): String {
            signIns++
            release.await()
            return "uid-$signIns".also { user = it }
        }
    }

    @Test fun concurrentCallersShareOneSignIn() = runTest {
        val auth = FakeAuth()
        val signIn = SignIn(current = { auth.user }, anonymous = auth::signInAnonymously, scope = backgroundScope)
        val calls = (1..3).map { async { signIn.ensureSignedIn() } }
        yield()
        auth.release.complete(Unit)
        assertEquals(listOf("uid-1", "uid-1", "uid-1"), calls.awaitAll())
        assertEquals(1, auth.signIns)
    }

    /** A caller cancelled while waiting (its screen closed) must not let the next caller start a second sign-in. */
    @Test fun aCancelledWaiterDoesNotStartASecondSignIn() = runTest {
        val auth = FakeAuth()
        val signIn = SignIn(current = { auth.user }, anonymous = auth::signInAnonymously, scope = backgroundScope)
        val first = launch { signIn.ensureSignedIn() }
        yield()
        first.cancel()
        val second = async { signIn.ensureSignedIn() }
        yield()
        auth.release.complete(Unit)
        assertEquals("uid-1", second.await())
        assertEquals(1, auth.signIns)
    }

    @Test fun aSignedInUserIsReturnedWithNoNewSignIn() = runTest {
        val auth = FakeAuth().apply { user = "existing" }
        assertEquals("existing", SignIn(current = { auth.user }, anonymous = auth::signInAnonymously, scope = backgroundScope).ensureSignedIn())
        assertEquals(0, auth.signIns)
    }
}
