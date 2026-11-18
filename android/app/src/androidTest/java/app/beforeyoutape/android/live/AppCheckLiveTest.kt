package app.beforeyoutape.android.live

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.auth.auth
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@Live
@RunWith(AndroidJUnit4::class)
class AppCheckLiveTest {
    /** The debug build's registered debug token gets an App Check token, and sign-in gives a user id. Nothing is printed. */
    @Test fun theDebugBuildGetsAnAppCheckTokenAndSignsIn(): Unit = runBlocking {
        val token = Firebase.appCheck.getAppCheckToken(false).await().token
        assertTrue("no App Check token", token.isNotEmpty())
        val uid = Firebase.auth.currentUser?.uid ?: Firebase.auth.signInAnonymously().await().user?.uid
        assertNotNull("no anonymous user", uid)
    }
}
