package app.beforeyoutape.android.ui

import app.beforeyoutape.android.ai.BlockReason
import app.beforeyoutape.android.ai.FailReason

/** Every sentence the app shows. Verdict words never appear here: they come from the rules engine. */
object Copy {
    /** The web app's consent sentence, with "laptop" changed to "phone" and nothing else. */
    const val CONSENT = "To check items when this phone can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?"
    const val ALLOW = "Allow"
    const val KEEP_ON_PHONE = "Keep everything on this phone"
    const val FOOTER = "Not affiliated with or approved by the US Postal Service."

    const val CHECK_NOW = "Check now"
    const val ADD_PHOTO = "Add a photo"
    const val TYPE_IT = "Type it"
    const val RETAKE = "Take the photo again"
    const val FIX_READING = "Fix this reading"
    const val RULES_NOT_LOADED = "The rules could not be loaded, so nothing is checked yet."
    const val KEPT_ON_PHONE = "Labels are read on this phone only."
    const val NO_ITEMS = "Nothing in the box yet."
    const val CAMERA_OFF = "Camera is off. Add a photo instead."
    const val PHOTO_FAILED = "That photo did not work. Take it again, or add a photo."
    const val HOLD_ZONE = "Hold the item's label inside this frame."

    /** Where an item's read ran. Web values are the laptop's own reads, seen from this phone. */
    fun source(readSource: String): String = when (readSource) {
        "phone_on_device" -> "Read on this phone"
        "phone_cloud" -> "Read in the cloud, from this phone"
        "on_device" -> "Read on the laptop"
        "in_cloud" -> "Read in the cloud, from the laptop"
        "manual" -> "Typed by you"
        else -> "Route not reported"
    }

    fun blocked(r: BlockReason): String = when (r) {
        BlockReason.NO_MODEL_NO_CONSENT -> "This phone can't read labels on its own, and nothing leaves it without your OK."
        BlockReason.OFFLINE -> "No connection. Type the item, or check it when you are back online."
        BlockReason.CLOUD_PAUSED -> "Cloud checks are paused."
        BlockReason.REFUSALS_PAUSED -> "The model would not read these photos. Type the item instead."
    }

    fun failed(r: FailReason): String = when (r) {
        FailReason.UNREADABLE -> "We could not read that label."
        FailReason.REFUSED -> "The model would not read that photo."
        FailReason.DEVICE_REPLY_FROM_CLOUD -> "That read did not stay on this phone, so it was not used."
        FailReason.DEVICE_ERROR -> "This phone's model could not read it."
        FailReason.CLOUD_ERROR -> "The check did not go through."
    }

    val ALL: List<String> = listOf(CONSENT, ALLOW, KEEP_ON_PHONE, FOOTER, CHECK_NOW, ADD_PHOTO, TYPE_IT, RETAKE, FIX_READING, RULES_NOT_LOADED,
        KEPT_ON_PHONE, NO_ITEMS, CAMERA_OFF, PHOTO_FAILED, HOLD_ZONE) + BlockReason.entries.map(::blocked) + FailReason.entries.map(::failed) +
        listOf("phone_on_device", "phone_cloud", "on_device", "in_cloud", "manual", "cloud_unreported").map(::source)
}
