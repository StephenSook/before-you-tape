package app.beforeyoutape.engine

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

/** The web repo's own files, read from disk: the rules edition, the shared vectors and the built bundle. */
object RepoFiles {
    private val root = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"))
    private val embed = File(System.getProperty("byt.embedDir") ?: error("byt.embedDir is not set by Gradle"))

    fun text(path: String): String = File(root, path).readText()
    fun array(path: String): JsonArray = Json.parseToJsonElement(text(path)).jsonArray
    fun obj(path: String): JsonObject = Json.parseToJsonElement(text(path)).jsonObject

    val bundle: String get() = File(embed, "byt-engine.js").readText()
    val bundleSha256: String get() = Json.parseToJsonElement(File(embed, "manifest.json").readText()).jsonObject.getValue("sha256").jsonPrimitive.content
    val edition: String get() = text("rules/edition.json")

    /** A host with the bundled edition loaded. */
    fun host(): EngineHost = EngineHost(QuickJsTestRuntime(), bundle, bundleSha256).also { it.setEdition(edition) }
}
