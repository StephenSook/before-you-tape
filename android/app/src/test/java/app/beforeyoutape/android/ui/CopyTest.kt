package app.beforeyoutape.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CopyTest {
    private val web = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"), "src/ui/ConsentNotice.tsx").readText()

    /**
     * The web app's consent sentence and choices with the device noun changed, and the web's clause about the cloud's
     * second look left out: Android runs no second look, so its question must not offer one.
     */
    @Test fun theConsentSentenceIsTheDesignSentenceForAPhone() {
        val sentence = Regex("\"(To read items this device[^\"]+)\"").find(web)!!.groupValues[1]
        val secondLook = ", and to check a read again when the rules ask"
        assertTrue("the web sentence names the second look: $sentence", sentence.contains(secondLook))
        assertEquals(sentence.replace("this device", "this phone").replace(secondLook, ""), Copy.CONSENT)
        assertTrue(web.contains(">Allow<"))
        assertEquals("Allow", Copy.ALLOW)
        assertTrue(web.contains(">Check on this device only<"))
        assertEquals("Check on this phone only", Copy.KEEP_ON_PHONE)
    }

    private fun webFile(path: String) = File(System.getProperty("byt.repoRoot")!!, path).readText()

    /** Fails when the shared item-read contract grows a field the phone form has no label for. */
    @Test fun everyContractFieldHasALabel() {
        val ts = webFile("src/shared/itemRead.ts")
        val table = ts.substring(ts.indexOf("ITEM_READ_FIELDS"), ts.indexOf("];", ts.indexOf("ITEM_READ_FIELDS")))
        val names = Regex("""name: "(\w+)"""").findAll(table).map { it.groupValues[1] }.toList()
        assertEquals(16, names.size)
        for (n in names) assertTrue("no label for $n", ReadCopy.fieldLabel(n) != null || n in ReadCopy.DERIVED)
    }

    /** The form's words are the web form's (src/ui/ReadFields.tsx and categoryLabels.ts). */
    @Test fun theFormLabelsAreTheWebFormsLabels() {
        val fields = webFile("src/ui/ReadFields.tsx")
        val pairs = Regex("""\["(\w+)", "([^"]+)"\]""").findAll(fields).associate { it.groupValues[1] to it.groupValues[2] }
        assertEquals(pairs.filterKeys { it in ReadCopy.NUMBERS.toMap() }, ReadCopy.NUMBERS.toMap())
        assertEquals(pairs.filterKeys { it in ReadCopy.FLAGS.toMap() }, ReadCopy.FLAGS.toMap())
        assertEquals(11, ReadCopy.NUMBERS.size + ReadCopy.FLAGS.size)
        for ((k, v) in ReadCopy.BOX_VALUES) assertTrue("box $k", fields.contains("${k.name}: \"$v\""))
        for (s in listOf(ReadCopy.CATEGORY, ReadCopy.CHOOSE_ONE, ReadCopy.LABEL_TEXT, ReadCopy.BOX)) assertTrue(s, fields.contains(">$s<"))
        val cats = Regex("""^\s*(\w+): "([^"]*)",?\s*$""", RegexOption.MULTILINE).findAll(webFile("src/ui/categoryLabels.ts"))
            .associate { it.groupValues[1] to it.groupValues[2] }
        assertEquals(cats, ReadCopy.CATEGORIES.mapKeys { it.key.name })
    }

    /** With a saved box this phone could not open, the box button names no count: 0 would say the box is empty. */
    @Test fun theBoxButtonNamesACountOnlyWhenTheBoxIsKnown() {
        assertEquals("See the box (2)", Copy.seeTheBox(2))
        assertEquals("See the box", Copy.seeTheBox(null))
        assertTrue(Copy.ALL.contains(Copy.SAVED_BOX_UNREADABLE))
        assertTrue(Copy.ALL.contains(Copy.seeTheBox(null)))
    }

    @Test fun theFooterDisclaimsThePostalService() {
        assertEquals("Not affiliated with or approved by the US Postal Service.", Copy.FOOTER)
    }

    /** Android runs no cloud second look, so nothing on screen may say or imply one. */
    @Test fun noCopyMentionsASecondLook() {
        for (text in Copy.ALL) {
            assertFalse(text, text.contains("second look", ignoreCase = true) || text.contains("looked again", ignoreCase = true) ||
                text.contains("read again", ignoreCase = true))
        }
    }

    /** A read on this phone's own model says so on its card: that one read and the rules decide. */
    @Test fun anOnDeviceReadSaysItWasReadOnThisPhone() {
        assertEquals("Read on this phone", Copy.source("phone_on_device"))
    }

    /** A build older than Remote Config's minimum_version_android says so and points at the release page. */
    @Test fun anOldBuildIsToldToUpdate() {
        assertEquals("This app needs an update.", Copy.UPDATE_NEEDED)
        assertEquals("Install the newest version from the download page, then open it again.", Copy.UPDATE_HOW)
        assertEquals("Open the download page", Copy.OPEN_DOWNLOADS)
        assertEquals("https://github.com/StephenSook/before-you-tape/releases/latest", Copy.DOWNLOAD_PAGE)
        assertTrue(Copy.ALL.containsAll(listOf(Copy.UPDATE_NEEDED, Copy.UPDATE_HOW, Copy.OPEN_DOWNLOADS)))
    }

    /** Where a read ran and how long it took, so a measured time shows on the card. */
    @Test fun aReadSaysWhereItRanAndHowLongItTook() {
        assertEquals("Read on this phone in 1.2 s.", Copy.readLine("phone_on_device", 1234.0))
        assertEquals("Read in the cloud, from this phone, in 3.5 s.", Copy.readLine("phone_cloud", 3497.0))
        assertEquals("Read on the laptop in 4.6 s.", Copy.readLine("on_device", 4600.0))
        assertEquals("Read in the cloud, from the laptop, in 12.3 s.", Copy.readLine("in_cloud", 12345.0))
        // No time for a typed item, or for a read whose time was never recorded.
        assertEquals("Typed by you", Copy.readLine("manual", 0.0))
        assertEquals("Read on this phone", Copy.readLine("phone_on_device", 0.0))
    }

    /** A release build sends each read's timing record (ai/AiTrace.kt), so no screen says nothing at all leaves the phone. */
    @Test fun noCopySaysNothingAtAllLeavesThePhone() {
        for (text in Copy.ALL) assertFalse(text, Regex("nothing leaves (it|the phone|this phone)\\.", RegexOption.IGNORE_CASE).containsMatchIn(text))
        assertEquals("This phone can get its own model to read labels, so no photo leaves it.", Copy.MODEL_CAN_DOWNLOAD)
    }

    @Test fun noCopyUsesADashOrACurlyQuote() {
        for (text in Copy.ALL) {
            assertTrue(text, text.none { it in "\u2013\u2014\u2018\u2019\u201C\u201D" })
        }
    }
}
