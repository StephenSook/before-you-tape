package app.beforeyoutape.engine

import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.security.MessageDigest

class EditionHashTest {
    /** The edition id is "byt-" plus the first 12 hex digits of the SHA-256 of its body; checked here in Kotlin. */
    @Test fun theBundledEditionHashesToItsId() {
        EngineHost(QuickJsTestRuntime(), RepoFiles.bundle, RepoFiles.bundleSha256).use { host ->
            val info = host.setEdition(RepoFiles.edition)
            val body = host.editionBodyCanonical().toByteArray(Charsets.UTF_8)
            val hex = MessageDigest.getInstance("SHA-256").digest(body).joinToString("") { "%02x".format(it) }
            assertEquals(info.editionId, "byt-" + hex.take(12))
            assertEquals(RepoFiles.obj("rules/edition.json").getValue("editionId").jsonPrimitive.content, info.editionId)
        }
    }
}
