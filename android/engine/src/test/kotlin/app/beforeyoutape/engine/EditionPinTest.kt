package app.beforeyoutape.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

/** The Remote Config edition pin, with the web app's rules and words (src/data/editionSource.ts). */
class EditionPinTest {
    private val sha1 = "1".repeat(64)
    private val sha2 = "2".repeat(64)
    private val sha3 = "3".repeat(64)
    private val bundled = PinnedEdition("byt-bundled", sha1, 2, """{"editionId":"byt-bundled"}""")
    private val newer = PinnedEdition("byt-newer", sha2, 3, """{"editionId":"byt-newer"}""")
    private val older = PinnedEdition("byt-older", sha3, 1, """{"editionId":"byt-older"}""")
    private val docs = mapOf("byt-newer" to newer, "byt-older" to older)
    private var fetches = 0

    /** Runs a suspend call whose fakes never suspend, without a coroutines library in this module. */
    private fun <T> now(block: suspend () -> T): T {
        var result: Result<T>? = null
        block.startCoroutine(Continuation(EmptyCoroutineContext) { result = it })
        return requireNotNull(result).getOrThrow()
    }

    private fun choose(wantId: String, wantSha: String, running: PinnedEdition = bundled, fetch: suspend (String) -> String? = { fetches++; docs[it]?.json }) =
        now { EditionPin.choose(bundled, running, wantId, wantSha, fetch) { json -> docs.values.firstOrNull { it.json == json } } }

    @Test fun anEmptyPinUsesTheBundledEdition() {
        val c = choose("", "")
        assertSame(bundled, c.edition)
        assertNull(c.notice)
        assertEquals(0, fetches)
    }

    @Test fun aPinNamingTheBundledEditionUsesIt() {
        val c = choose("byt-bundled", sha1, running = newer)
        assertSame(bundled, c.edition)
        assertNull(c.notice)
    }

    @Test fun aPinNamingTheEditionInUseKeepsIt() {
        val c = choose("byt-newer", sha2, running = newer)
        assertSame(newer, c.edition)
        assertNull(c.notice)
        assertEquals(0, fetches)
    }

    @Test fun aNewerVerifiedEditionIsUsed() {
        val c = choose("byt-newer", sha2)
        assertSame(newer, c.edition)
        assertNull(c.notice)
    }

    @Test fun aMissingOrUnreachableEditionKeepsTheOneInUse() {
        assertEquals(EditionChoice(bundled, EditionPin.NOT_LOADED), choose("byt-missing", sha2))
        assertEquals(EditionChoice(bundled, EditionPin.NOT_LOADED), choose("byt-newer", sha2, fetch = { throw RuntimeException("offline") }))
        assertEquals(EditionChoice(bundled, EditionPin.NOT_LOADED), choose("byt-newer", sha2, fetch = { "{not json" }))
    }

    @Test fun aWrongIdOrHashFailsTheIntegrityCheck() {
        assertEquals(EditionChoice(bundled, EditionPin.FAILED_CHECK), choose("byt-newer", sha2, fetch = { older.json }))
        assertEquals(EditionChoice(bundled, EditionPin.FAILED_CHECK), choose("byt-newer", sha3))
    }

    @Test fun anEditionTheRulesRefuseIsNotRead() {
        val c = choose("byt-bad", sha2, fetch = { """{"editionId":"byt-bad"}""" })
        assertEquals(EditionChoice(bundled, EditionPin.NOT_READ), c)
    }

    @Test fun anOlderEditionIsNeverUsed() {
        assertEquals(EditionChoice(bundled, EditionPin.OLDER), choose("byt-older", sha3))
        assertEquals(EditionChoice(newer, EditionPin.OLDER_THAN_IN_USE), choose("byt-older", sha3, running = newer))
    }
}
