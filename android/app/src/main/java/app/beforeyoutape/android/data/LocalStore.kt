package app.beforeyoutape.android.data

import android.content.Context

/** A string key-value store; SharedPreferences in the app, a map in tests. */
interface Prefs {
    fun get(key: String): String?
    fun put(key: String, value: String)
}

class SharedPrefs(context: Context) : Prefs {
    private val p = context.getSharedPreferences("byt_local", Context.MODE_PRIVATE)
    override fun get(key: String): String? = p.getString(key, null)
    override fun put(key: String, value: String) {
        p.edit().putString(key, value).apply()
    }
}

/**
 * What this phone remembers: the cloud consent (per device, never synced) and the last
 * destination. Label text and crops are not kept here.
 */
class LocalStore(private val prefs: Prefs) {
    /** null until the person chooses; anything unreadable counts as not chosen. */
    fun cloudConsent(): Boolean? = when (prefs.get(CONSENT)) {
        YES -> true
        NO -> false
        else -> null
    }

    fun setCloudConsent(allowed: Boolean) = prefs.put(CONSENT, if (allowed) YES else NO)

    fun destination(): String? = prefs.get(DESTINATION)

    fun setDestination(code: String) = prefs.put(DESTINATION, code)

    private companion object {
        const val CONSENT = "cloud_consent"
        const val DESTINATION = "destination"
        const val YES = "allowed"
        const val NO = "kept_on_phone"
    }
}
