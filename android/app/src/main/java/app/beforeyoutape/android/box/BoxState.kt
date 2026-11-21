package app.beforeyoutape.android.box

import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult

/**
 * One item in the box. [readSource] is "phone_on_device", "phone_cloud", "manual" or a value the web
 * app wrote. [extras] keeps the web app's item fields this phone does not use (secondLook,
 * readFallback, cropKey, customs), so syncing an item never drops them. [readMs] can be fractional:
 * the web app times reads with performance.now().
 */
data class BoxItem(
    val input: BoxItemInput,
    val readSource: String,
    val readMs: Double,
    val cropFile: String?,
    val extras: Map<String, Any?> = emptyMap(),
    /**
     * The rule edition whose label words made [BoxItemInput.labelTags]; "" when there was no label text, so the tags
     * depend on no edition; null when unknown (a box saved before this was kept). Kept on this phone only.
     */
    val tagsEdition: String? = null,
)

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
