package app.beforeyoutape.android.ui

import org.junit.Assert.assertEquals
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

    @Test fun theFooterDisclaimsThePostalService() {
        assertEquals("Not affiliated with or approved by the US Postal Service.", Copy.FOOTER)
    }

    @Test fun noCopyUsesADashOrACurlyQuote() {
        for (text in Copy.ALL) {
            assertTrue(text, text.none { it in "\u2013\u2014\u2018\u2019\u201C\u201D" })
        }
    }
}
