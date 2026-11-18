package app.beforeyoutape.android.capture

import kotlin.math.roundToInt

/** The hold zone as fractions of the upright frame: left, top, width, height. */
data class Zone(val x: Float, val y: Float, val w: Float, val h: Float)

data class PixelRect(val left: Int, val top: Int, val width: Int, val height: Int)

data class PixelSize(val width: Int, val height: Int)

/** The web app's crop limits (src/shared/cropLimits.ts); a unit test keeps them equal. */
object CropLimits {
    const val MAX_SIDE = 768
    const val JPEG_QUALITY = 0.85f
    const val MAX_BYTES = 500_000
}

/** The hold zone's shape: 4 wide by 3 tall, drawn 80% of the preview's width (less when the
 * preview is too short), centred. */
const val HOLD_ZONE_ASPECT_W = 4f
const val HOLD_ZONE_ASPECT_H = 3f
const val HOLD_ZONE_WIDTH = 0.8f

/** The hold zone as fractions of a preview (and so of the upright frame) of this size. */
fun holdZoneFor(previewW: Int, previewH: Int): Zone {
    val h = (HOLD_ZONE_WIDTH * previewW * HOLD_ZONE_ASPECT_H / HOLD_ZONE_ASPECT_W / previewH).coerceAtMost(0.9f)
    val w = h * previewH * HOLD_ZONE_ASPECT_W / HOLD_ZONE_ASPECT_H / previewW
    return Zone((1f - w) / 2f, (1f - h) / 2f, w, h)
}

/** Pure crop math: only the hold zone ever leaves the phone, never the whole frame. */
object Crop {
    /** The zone in pixels, clipped to the frame. */
    fun zoneRect(frameW: Int, frameH: Int, zone: Zone): PixelRect {
        val left = (zone.x * frameW).roundToInt().coerceIn(0, frameW)
        val top = (zone.y * frameH).roundToInt().coerceIn(0, frameH)
        val right = ((zone.x + zone.w) * frameW).roundToInt().coerceIn(left, frameW)
        val bottom = ((zone.y + zone.h) * frameH).roundToInt().coerceIn(top, frameH)
        return PixelRect(left, top, right - left, bottom - top)
    }

    /** The size with the longest side at most [maxSide], keeping the shape; never enlarged. */
    fun scaleToMaxSide(w: Int, h: Int, maxSide: Int): PixelSize {
        val longest = maxOf(w, h)
        if (longest <= maxSide) return PixelSize(w, h)
        val k = maxSide.toFloat() / longest
        return PixelSize(maxOf(1, (w * k).roundToInt()), maxOf(1, (h * k).roundToInt()))
    }

    /** The largest centred rectangle of the given shape inside a picked photo. */
    fun centerToAspect(w: Int, h: Int, aspectW: Float, aspectH: Float): PixelRect {
        val target = aspectW / aspectH
        return if (w.toFloat() / h > target) {
            val cw = (h * target).roundToInt()
            PixelRect((w - cw) / 2, 0, cw, h)
        } else {
            val ch = (w / target).roundToInt()
            PixelRect(0, (h - ch) / 2, w, ch)
        }
    }
}
