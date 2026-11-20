package app.beforeyoutape.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CopyTest {
    private val web = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"), "src/ui/ConsentNotice.tsx").readText()

    /** The web app's consent sentence and choices with the device noun changed, and nothing else. */
    @Test fun theConsentSentenceIsTheDesignSentenceForAPhone() {
        val sentence = Regex("\"(To check items when this laptop[^\"]+)\"").find(web)!!.groupValues[1]
        assertEquals(sentence.replace("this laptop", "this phone"), Copy.CONSENT)
        assertTrue(web.contains(">Allow<"))
        assertEquals("Allow", Copy.ALLOW)
        assertTrue(web.contains(">Keep everything on this laptop<"))
        assertEquals("Keep everything on this phone", Copy.KEEP_ON_PHONE)
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

    @Test fun theFooterDisclaimsThePostalService() {
        assertEquals("Not affiliated with or approved by the US Postal Service.", Copy.FOOTER)
    }

    /** Android runs no cloud second look, so nothing on screen may say or imply one. */
    @Test fun noCopyMentionsASecondLook() {
        for (text in Copy.ALL) {
            assertFalse(text, text.contains("second look", ignoreCase = true) || text.contains("looked again", ignoreCase = true))
        }
    }

    /** A read on this phone's own model says so on its card: that one read and the rules decide. */
    @Test fun anOnDeviceReadSaysItWasReadOnThisPhone() {
        assertEquals("Read on this phone", Copy.source("phone_on_device"))
    }

    @Test fun noCopyUsesADashOrACurlyQuote() {
        for (text in Copy.ALL) {
            assertTrue(text, text.none { it in "\u2013\u2014\u2018\u2019\u201C\u201D" })
        }
    }
}
