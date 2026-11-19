package app.beforeyoutape.android.capture

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UprightTest {
    /** A 400x300 buffer: red where x < 200, blue elsewhere. */
    private fun buffer(): Bitmap = Bitmap.createBitmap(400, 300, Bitmap.Config.ARGB_8888).apply {
        for (x in 0 until 400) for (y in 0 until 300) setPixel(x, y, if (x < 200) Color.RED else Color.BLUE)
    }

    @Test fun aQuarterTurnPutsTheBufferUprightBeforeTheZoneIsCut() {
        val upright = Upright.frame(buffer(), Rect(0, 0, 400, 300), 90)
        assertEquals(300, upright.width)
        assertEquals(400, upright.height)
        // Clockwise: the buffer's left (red) side becomes the top.
        val top = Upright.zone(upright, Zone(0f, 0f, 1f, 0.5f), CropLimits.MAX_SIDE)
        assertEquals(300, top.width)
        assertEquals(200, top.height)
        assertEquals(Color.RED, top.getPixel(150, 100))
        assertTrue("the full frame is dropped once the zone is cut", upright.isRecycled)
    }

    @Test fun theCropRectangleIsAppliedBeforeTheTurn() {
        val upright = Upright.frame(buffer(), Rect(100, 0, 300, 300), 0)
        assertEquals(200, upright.width)
        assertEquals(300, upright.height)
        assertEquals(Color.RED, upright.getPixel(50, 150))
        assertEquals(Color.BLUE, upright.getPixel(150, 150))
    }

    @Test fun aLargeZoneIsScaledToTheSharedLimit() {
        val big = Bitmap.createBitmap(2000, 1000, Bitmap.Config.ARGB_8888)
        val out = Upright.zone(big, Zone(0f, 0f, 1f, 1f), CropLimits.MAX_SIDE)
        assertEquals(768, out.width)
        assertEquals(384, out.height)
    }

    @Test fun aPickedPhotoIsCutToTheZoneShapeAndScaled() {
        val photo = Bitmap.createBitmap(3000, 4000, Bitmap.Config.ARGB_8888)
        val out = Upright.picked(photo, HOLD_ZONE_ASPECT_W, HOLD_ZONE_ASPECT_H, CropLimits.MAX_SIDE)
        assertEquals(HOLD_ZONE_ASPECT_W / HOLD_ZONE_ASPECT_H, out.width.toFloat() / out.height, 0.01f)
        assertEquals(768, maxOf(out.width, out.height))
    }
}
