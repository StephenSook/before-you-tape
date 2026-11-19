package app.beforeyoutape.android.ui

import app.beforeyoutape.android.ai.DeviceModelStatus

/** What "About this phone" shows: what reads labels here, and the build and rules it runs. */
data class AboutInfo(
    val deviceModel: DeviceModelStatus,
    /** The cloud model's name, from Remote Config. */
    val cloudModel: String,
    /** "play_integrity" in a release build, "debug" in a debug build. */
    val appCheckProvider: String,
    val editionId: String,
    /** The commit the rules bundle was built from, from its manifest. */
    val bundleCommit: String,
    val bundleSha256: String,
    val version: String,
)

object About {
    const val RULES_URL = "https://before-you-tape-2026.web.app/rules"

    /**
     * One line each. The SDK does not report the on-device model's name, so a ready model is
     * "ready" and never named.
     */
    fun rows(i: AboutInfo): List<String> = buildList {
        add(Copy.modelSentence(i.deviceModel))
        if (i.deviceModel == DeviceModelStatus.AVAILABLE) add("On-device model: ready")
        add("Cloud model: ${i.cloudModel}")
        add("App Check: ${i.appCheckProvider}")
        add("Rules edition: ${i.editionId}")
        add("Rules bundle: ${i.bundleCommit.take(7)} (${i.bundleSha256.take(12)})")
        add("Version ${i.version}")
        add("License: Apache-2.0")
    }
}
