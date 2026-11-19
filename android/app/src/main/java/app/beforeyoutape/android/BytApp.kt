package app.beforeyoutape.android

import android.app.Application
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.appCheck
import app.beforeyoutape.android.data.FirebaseSignIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** The app process: App Check before any other Firebase call, then anonymous sign-in. */
class BytApp : Application() {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        // FirebaseApp comes from google-services.json; a build without it has no Firebase.
        if (FirebaseApp.getApps(this).isNotEmpty()) {
            Firebase.appCheck.installAppCheckProviderFactory(AppCheckSetup.factory())
            // The same shared sign-in every later caller uses, so no second anonymous user can race it.
            appScope.launch { runCatching { FirebaseSignIn.ensureSignedIn() } }
        }
    }
}
