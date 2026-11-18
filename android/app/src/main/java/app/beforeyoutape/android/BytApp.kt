package app.beforeyoutape.android

import android.app.Application
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.appCheck
import com.google.firebase.auth.auth

/** The app process: App Check before any other Firebase call, then anonymous sign-in. */
class BytApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // FirebaseApp comes from google-services.json; a build without it has no Firebase.
        if (FirebaseApp.getApps(this).isNotEmpty()) {
            Firebase.appCheck.installAppCheckProviderFactory(AppCheckSetup.factory())
            if (Firebase.auth.currentUser == null) Firebase.auth.signInAnonymously()
        }
    }
}
