package app.beforeyoutape.engine

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.security.MessageDigest

/** A rules edition with the SHA-256 of its canonical JSON (the hash Remote Config pins) and its revision. */
data class PinnedEdition(val editionId: String, val sha256: String, val revision: Int, val json: String)

/** The edition to use, and a line to show when a pinned edition was not used. */
data class EditionChoice(val edition: PinnedEdition, val notice: String?)

object EditionCheck {
    /**
     * Loads [json] into [host], a spare host, and returns its id, canonical hash and revision, or null
     * when the rules refuse it. The engine's own canonical JSON is the text the publish script hashes.
     */
    fun verify(host: EngineHost, json: String): PinnedEdition? {
        val info = try {
            host.setEdition(json)
        } catch (e: EngineError) {
            return null
        }
        val canonical = host.canonicalEdition()
        val hash = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        val revision = Json.parseToJsonElement(canonical).jsonObject["revision"]?.jsonPrimitive?.intOrNull ?: 0
        return PinnedEdition(info.editionId, hash, revision, json)
    }
}

/**
 * Follows the Remote Config edition pin as the web app does (src/data/editionSource.ts): a newer
 * edition named by id and SHA-256 is used only when the fetched document has exactly that id and
 * hash, the rules accept it, and its revision is higher than the one in use. Anything else keeps the
 * edition in use and says why.
 */
object EditionPin {
    const val NOT_LOADED = "A newer rule edition could not be loaded. Using the built-in edition."
    const val FAILED_CHECK = "A newer rule edition failed its integrity check. Using the built-in edition."
    const val NOT_READ = "A newer rule edition could not be read. Using the built-in edition."
    const val OLDER_THAN_IN_USE = "The pinned rule edition is older than the one in use. Keeping the one in use."

    suspend fun choose(
        bundled: PinnedEdition,
        running: PinnedEdition,
        wantId: String,
        wantSha: String,
        fetch: suspend (String) -> String?,
        verify: (String) -> PinnedEdition?,
    ): EditionChoice {
        val id = wantId.trim()
        val sha = wantSha.trim().lowercase()
        // Clearing the pin, or naming the built-in edition, is the deliberate way back to it.
        if (id.isEmpty() || (id == bundled.editionId && sha == bundled.sha256)) return EditionChoice(bundled, null)
        if (id == running.editionId) return EditionChoice(running, null)

        val json = try {
            fetch(id)
        } catch (e: Exception) {
            if (e is kotlin.coroutines.cancellation.CancellationException) throw e
            null
        } ?: return EditionChoice(running, NOT_LOADED)
        val docId = runCatching { Json.parseToJsonElement(json).jsonObject["editionId"]?.jsonPrimitive?.contentOrNull }
            .getOrElse { return EditionChoice(running, NOT_LOADED) }
        if (docId != id) return EditionChoice(running, FAILED_CHECK)
        val edition = verify(json) ?: return EditionChoice(running, NOT_READ)
        if (edition.sha256 != sha) return EditionChoice(running, FAILED_CHECK)
        // A pin that is not newer than the rules in use would bring back rules a later edition fixed. A pin older than
        // this build's own edition is the usual state (the pin is for phone builds made before this one), so it says
        // nothing; one older than a newer edition already in use says it is kept (as on the web).
        if (edition.revision <= running.revision) return EditionChoice(running, if (running === bundled) null else OLDER_THAN_IN_USE)
        return EditionChoice(edition, null)
    }
}
