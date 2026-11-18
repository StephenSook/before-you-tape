package app.beforeyoutape.android.capture

import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.Rect

/** Bitmap steps from a camera buffer or a picked photo to the pixels a read sends. */
object Upright {
    /**
     * The frame as the preview showed it: the buffer cut to [cropRect] (buffer coordinates; the
     * preview's viewport), then turned [rotationDegrees] clockwise. CameraX hands over the
     * buffer unrotated and `toBitmap()` ignores the crop rectangle, so both are applied here.
     */
    fun frame(buffer: Bitmap, cropRect: Rect, rotationDegrees: Int): Bitmap {
        val r = Rect(cropRect)
        require(r.intersect(0, 0, buffer.width, buffer.height)) { "the crop rectangle is outside the frame" }
        val m = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
        val out = Bitmap.createBitmap(buffer, r.left, r.top, r.width(), r.height(), m, true)
        if (out !== buffer) buffer.recycle()
        return out
    }

    /** The zone of an upright frame, its longest side at most [maxSide]. The frame is recycled. */
    fun zone(upright: Bitmap, zone: Zone, maxSide: Int): Bitmap {
        val r = Crop.zoneRect(upright.width, upright.height, zone)
        require(r.width > 0 && r.height > 0) { "the zone is empty" }
        return cutAndScale(upright, r, maxSide)
    }

    /** A picked photo (already upright), cut to the zone's shape around its centre and scaled. */
    fun picked(photo: Bitmap, aspectW: Float, aspectH: Float, maxSide: Int): Bitmap =
        cutAndScale(photo, Crop.centerToAspect(photo.width, photo.height, aspectW, aspectH), maxSide)

    private fun cutAndScale(source: Bitmap, r: PixelRect, maxSide: Int): Bitmap {
        val s = Crop.scaleToMaxSide(r.width, r.height, maxSide)
        val m = Matrix().apply { setScale(s.width.toFloat() / r.width, s.height.toFloat() / r.height) }
        val out = Bitmap.createBitmap(source, r.left, r.top, r.width, r.height, m, true)
        // The full frame is dropped at once; only the cut leaves this function.
        if (out !== source) source.recycle()
        return out
    }
}
