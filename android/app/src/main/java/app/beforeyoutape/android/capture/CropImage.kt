package app.beforeyoutape.android.capture

import android.graphics.Bitmap

/** The cropped hold zone that a read sends: only these pixels ever leave the phone, never the full frame. */
interface CropImage {
    val widthPx: Int
    val heightPx: Int
}

class BitmapCrop(val bitmap: Bitmap) : CropImage {
    override val widthPx: Int get() = bitmap.width
    override val heightPx: Int get() = bitmap.height
}
