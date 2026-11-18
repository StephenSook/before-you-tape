package app.beforeyoutape.android.box

import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult

/** One item in the box. [readSource] is "phone_on_device", "phone_cloud", "manual" or a value the web app wrote. */
data class BoxItem(val input: BoxItemInput, val readSource: String, val readMs: Long, val cropFile: String?)

/**
 * The box on this phone. [result] is always recomputed from the items, the destination and the
 * edition by the engine; nothing keeps a verdict as truth. With no engine there is no verdict.
 */
data class BoxState(
    val boxId: String?,
    val destinationCode: String,
    val items: List<BoxItem>,
    val result: BoxResult?,
    val cloudConsent: Boolean?,
    val onDeviceReads: Int,
    val cloudReads: Int,
    val rulesOnlyRechecks: Int,
    val engineError: String?,
)
