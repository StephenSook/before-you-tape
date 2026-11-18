package app.beforeyoutape.android.ai

enum class ReadRoute { DEVICE_ONLY, HYBRID, CLOUD_ONLY, BLOCKED }

/** What decides whether a photo may leave the phone. Unanswered consent (null) counts as not given. */
data class CloudState(val consent: Boolean?, val online: Boolean, val killCloud: Boolean)

/** The read routes of the design table. Nothing here can send a photo without consent. */
object ReadRoutes {
    fun cloudAllowed(consent: Boolean?, online: Boolean, killCloud: Boolean): Boolean = consent == true && online && !killCloud

    fun cloudAllowed(s: CloudState): Boolean = cloudAllowed(s.consent, s.online, s.killCloud)

    /** The four rows: a ready on-device model with the cloud allowed is hybrid, without it device-only; no model is cloud-only or blocked. */
    fun choose(gate: DeviceModelStatus, cloudAllowed: Boolean): ReadRoute = when {
        gate == DeviceModelStatus.AVAILABLE && cloudAllowed -> ReadRoute.HYBRID
        gate == DeviceModelStatus.AVAILABLE -> ReadRoute.DEVICE_ONLY
        cloudAllowed -> ReadRoute.CLOUD_ONLY
        else -> ReadRoute.BLOCKED
    }
}
