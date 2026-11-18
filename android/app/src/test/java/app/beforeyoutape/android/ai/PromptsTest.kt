package app.beforeyoutape.android.ai

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class PromptsTest {
    private val root = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"))
    private val ts = File(root, "src/ai/prompts.ts").readText()

    /** The double-quoted string literals in [code], decoded as JSON strings. */
    private fun literals(code: String): List<String> =
        Regex("\"((?:[^\"\\\\]|\\\\.)*)\"").findAll(code).map { Json.decodeFromString<JsonPrimitive>(it.value).content }.toList()

    private fun between(start: String, end: String): String {
        val i = ts.indexOf(start)
        check(i >= 0) { "$start is not in prompts.ts" }
        return ts.substring(i + start.length, ts.indexOf(end, i))
    }

    @Test fun theSystemLinesAreTheWebAppsWordForWord() {
        val lines = literals(between("export const ITEM_READ_SYSTEM = [", "].join"))
        assertTrue(ts.contains("].join(\"\\n\");"))
        assertEquals(5, lines.size)
        assertEquals(lines.joinToString("\n"), Prompts.ITEM_READ_SYSTEM)
    }

    @Test fun theReadPromptIsTheWebAppsWordForWord() {
        assertEquals(literals(between("export const ITEM_READ_PROMPT =", ";")).joinToString(""), Prompts.ITEM_READ_PROMPT)
    }

    /** Every read sends the system lines: the model is built with them in AiClient. */
    @Test fun everyReadModelIsBuiltWithTheSystemLines() {
        val src = File(root, "android/app/src/main/java/app/beforeyoutape/android/ai/AiClient.kt").readText()
        assertEquals(1, Regex("generativeModel\\(").findAll(src).count())
        assertTrue(src.contains("systemInstruction = content { text(Prompts.ITEM_READ_SYSTEM) }"))
    }
}
