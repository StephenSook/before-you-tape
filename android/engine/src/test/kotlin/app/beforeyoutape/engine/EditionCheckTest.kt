package app.beforeyoutape.engine

import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.security.MessageDigest

class EditionCheckTest {
    private fun host() = EngineHost(QuickJsTestRuntime(), RepoFiles.bundle, RepoFiles.bundleSha256)

    /** The hash is the SHA-256 of the edition's canonical JSON, the value the publish script prints for Remote Config. */
    @Test fun theBundledEditionVerifiesWithItsCanonicalHashAndRevision() {
        host().use { h ->
            val v = requireNotNull(EditionCheck.verify(h, RepoFiles.edition))
            val canonical = h.canonicalEdition().toByteArray(Charsets.UTF_8)
            val hex = MessageDigest.getInstance("SHA-256").digest(canonical).joinToString("") { "%02x".format(it) }
            assertEquals(RepoFiles.obj("rules/edition.json").getValue("editionId").jsonPrimitive.content, v.editionId)
            assertEquals(hex, v.sha256)
            assertEquals(RepoFiles.obj("rules/revision.json").getValue("revision").jsonPrimitive.int, v.revision)
            assertEquals(RepoFiles.edition, v.json)
        }
    }

    @Test fun anEditionTheRulesRefuseGivesNothing() {
        host().use { h -> assertNull(EditionCheck.verify(h, """{"editionId":"byt-bad"}""")) }
    }
}
