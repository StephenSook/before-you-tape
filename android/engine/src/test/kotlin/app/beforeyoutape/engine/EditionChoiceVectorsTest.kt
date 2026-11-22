package app.beforeyoutape.engine

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

/**
 * tests/vectors/editionChoice.json through this app's edition choice (EditionPin.choose), as the web harness runs it
 * (src/data/editionChoice.test.ts): every document is the built-in edition's rules under another id, with its revision
 * moved by an offset, verified by this app's engine. Every case runs; a failure names each case that differs.
 */
class EditionChoiceVectorsTest {
    private val pinId = "byt-vectorpin01"
    private val useId = "byt-vectoruse01"
    private val zeros = "0".repeat(64)
    private val notices = mapOf(
        "notLoaded" to EditionPin.NOT_LOADED, "failedCheck" to EditionPin.FAILED_CHECK,
        "notRead" to EditionPin.NOT_READ, "olderThanInUse" to EditionPin.OLDER_THAN_IN_USE,
    )

    private fun <T> now(block: suspend () -> T): T {
        var result: Result<T>? = null
        block.startCoroutine(Continuation(EmptyCoroutineContext) { result = it })
        return requireNotNull(result).getOrThrow()
    }

    @Test fun everySharedEditionChoiceVectorGivesItsEditionAndNotice() {
        val cases = RepoFiles.array("tests/vectors/editionChoice.json").map { it.jsonObject }
        assertTrue("edition choice vectors: ${cases.size}", cases.size >= 16)
        val raw = RepoFiles.obj("rules/edition.json")
        val differ = RepoFiles.host().use { spare ->
            fun verify(json: String) = EditionCheck.verify(spare, json)
            val bundled = requireNotNull(verify(RepoFiles.edition))
            // The built-in edition's rules under another id, its revision moved by an offset (null: no revision).
            fun doc(id: String, offset: Int?): JsonObject = JsonObject(
                (raw - "revision") + ("editionId" to JsonPrimitive(id)) + (offset?.let { mapOf("revision" to JsonPrimitive(bundled.revision + it)) } ?: emptyMap()),
            )
            fun offset(o: JsonObject) = (o["revision"] as? JsonPrimitive)?.intOrNull
            cases.mapNotNull { c ->
                val name = c.getValue("name").jsonPrimitive.content
                val inUse = c.getValue("inUse")
                val useDoc = (inUse as? JsonObject)?.let { doc(useId, offset(it)) }
                val running = useDoc?.let { requireNotNull(verify(it.toString())) } ?: bundled
                var wantId = ""
                var wantSha = ""
                var fetch: suspend (String) -> String? = { null }
                when (val pin = c.getValue("pin")) {
                    is JsonPrimitive -> when (pin.content) {
                        "none" -> Unit
                        "builtIn" -> { wantId = bundled.editionId; wantSha = bundled.sha256 }
                        "builtInIdWrongSha" -> { wantId = bundled.editionId; wantSha = zeros; fetch = { RepoFiles.edition } }
                        "inUse" -> { wantId = useId; wantSha = running.sha256; fetch = { useDoc.toString() } }
                        else -> error("$name: no such pin ${pin.content}")
                    }
                    is JsonObject -> {
                        val kind = pin.getValue("doc").jsonPrimitive.content
                        val pinDoc = doc(pinId, offset(pin))
                        val served = when (kind) {
                            "wrongId" -> JsonObject(pinDoc + ("editionId" to JsonPrimitive("byt-vectorother")))
                            "unreadable" -> JsonObject(mapOf("editionId" to JsonPrimitive(pinId), "revision" to JsonPrimitive(99)))
                            else -> pinDoc
                        }.toString()
                        wantId = pinId
                        // A document the rules refuse, or one under another id, has no hash this app can take; any will do.
                        wantSha = if (kind == "wrongHash") zeros else verify(served)?.sha256 ?: "f".repeat(64)
                        fetch = { if (kind == "fetchFails") error("offline") else if (kind == "missing") null else served }
                    }
                    else -> error("$name: no such pin $pin")
                }
                var fetched = false
                val got = now { EditionPin.choose(bundled, running, wantId, wantSha, { id -> fetched = true; fetch(id) }, ::verify) }
                val expect = c.getValue("expect").jsonObject
                val wantUse = when (val u = expect.getValue("use").jsonPrimitive.content) {
                    "builtIn" -> bundled.editionId
                    "inUse" -> useId
                    "pin" -> pinId
                    else -> error("$name: no such use $u")
                }
                val wantNotice = (expect.getValue("notice") as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { notices.getValue(it) }
                val wantFetched = expect.getValue("fetched").jsonPrimitive.content.toBoolean()
                val problems = listOfNotNull(
                    "uses ${got.edition.editionId}, want $wantUse".takeIf { got.edition.editionId != wantUse },
                    "notice ${got.notice}, want $wantNotice".takeIf { got.notice != wantNotice },
                    "fetched $fetched, want $wantFetched".takeIf { fetched != wantFetched },
                )
                if (problems.isEmpty()) null else "$name: ${problems.joinToString("; ")}"
            }
        }
        assertEquals("cases that differ:\n${differ.joinToString("\n")}", emptyList<String>(), differ)
    }
}
