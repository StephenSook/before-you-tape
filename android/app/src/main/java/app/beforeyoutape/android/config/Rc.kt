package app.beforeyoutape.android.config

import app.beforeyoutape.android.R
import com.google.firebase.remoteconfig.ConfigUpdate
import com.google.firebase.remoteconfig.ConfigUpdateListener
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigException
import com.google.firebase.remoteconfig.remoteConfigSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Where Remote Config values come from; the Firebase one listens in real time. */
interface RcSource {
    fun snapshot(): Map<String, String>
    fun start(onChange: () -> Unit)
}

/**
 * The app's live Remote Config values. Until the in-app defaults or a fetch load, the map is
 * empty: no cloud model is set, so no cloud read can start.
 */
class RcStore(private val source: RcSource) {
    private val state = MutableStateFlow(RcValues.parse(source.snapshot()))
    val values: StateFlow<RcValues> = state

    fun current(): RcValues = state.value

    fun start() {
        publish()
        source.start { publish() }
    }

    private fun publish() {
        state.value = RcValues.parse(source.snapshot())
    }
}

/** Firebase Remote Config with the in-app defaults XML, a fetch at start and a real-time listener. */
class FirebaseRcSource(private val remote: FirebaseRemoteConfig) : RcSource {
    override fun snapshot(): Map<String, String> = remote.all.mapValues { it.value.asString() }

    override fun start(onChange: () -> Unit) {
        remote.setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = 300 })
        remote.setDefaultsAsync(R.xml.remote_config_defaults).addOnCompleteListener { onChange() }
        remote.fetchAndActivate().addOnCompleteListener { onChange() }
        remote.addOnConfigUpdateListener(object : ConfigUpdateListener {
            override fun onUpdate(configUpdate: ConfigUpdate) {
                remote.activate().addOnCompleteListener { onChange() }
            }

            override fun onError(error: FirebaseRemoteConfigException) {
                // The last activated values stay in force.
            }
        })
    }
}
