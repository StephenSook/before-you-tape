package app.beforeyoutape.android.capture

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class CropTest {
    @Test fun theCropIsTheHoldZoneNeverTheWholeFrame() {
        assertEquals(PixelRect(400, 900, 3200, 1200), Crop.zoneRect(4000, 3000, Zone(0.1f, 0.3f, 0.8f, 0.4f)))
    }

    @Test fun aZoneOutsideTheFrameIsClippedToIt() {
        assertEquals(PixelRect(3600, 2700, 400, 300), Crop.zoneRect(4000, 3000, Zone(0.9f, 0.9f, 0.5f, 0.5f)))
    }

    @Test fun aLargeCropIsScaledToTheSharedLimit() {
        assertEquals(PixelSize(768, 288), Crop.scaleToMaxSide(3200, 1200, CropLimits.MAX_SIDE))
        assertEquals(PixelSize(288, 768), Crop.scaleToMaxSide(1200, 3200, CropLimits.MAX_SIDE))
    }

    @Test fun aSmallCropIsNotEnlarged() {
        assertEquals(PixelSize(640, 240), Crop.scaleToMaxSide(640, 240, CropLimits.MAX_SIDE))
    }

    @Test fun aPickedPhotoIsCutToTheZoneShape() {
        // A 3000x4000 portrait photo cut to the zone's 2:1 shape, centred.
        assertEquals(PixelRect(0, 1250, 3000, 1500), Crop.centerToAspect(3000, 4000, 2f, 1f))
        // A very wide photo keeps its full height and loses its sides.
        assertEquals(PixelRect(1000, 0, 2000, 1000), Crop.centerToAspect(4000, 1000, 2f, 1f))
    }

    @Test fun theHoldZoneIsFourByThreeAndCentred() {
        val z = holdZoneFor(1080, 1920)
        assertEquals(0.8f, z.w, 1e-4f)
        assertEquals(4f / 3f, z.w * 1080 / (z.h * 1920), 1e-3f)
        assertEquals(0.1f, z.x, 1e-4f)
        assertEquals((1f - z.h) / 2f, z.y, 1e-4f)
    }

    @Test fun onAShortPreviewTheHoldZoneKeepsItsShapeAndFits() {
        val z = holdZoneFor(1920, 1080)
        assertEquals(0.9f, z.h, 1e-4f)
        assertEquals(4f / 3f, z.w * 1920 / (z.h * 1080), 1e-3f)
        assertEquals(true, z.x >= 0f && z.x + z.w <= 1f)
    }

    /** The phone uses the web app's own crop limits (src/shared/cropLimits.ts), so every side agrees. */
    @Test fun theLimitsAreTheSharedLimits() {
        val root = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"))
        val ts = File(root, "src/shared/cropLimits.ts").readText()
        fun number(key: String) = Regex("""\b$key:\s*([0-9_.]+)""").find(ts)?.groupValues?.get(1)?.replace("_", "") ?: error("no $key")
        assertEquals(number("maxSide").toInt(), CropLimits.MAX_SIDE)
        assertEquals(number("jpegQuality").toFloat(), CropLimits.JPEG_QUALITY)
        assertEquals(number("maxBytes").toInt(), CropLimits.MAX_BYTES)
    }
}
