package app.beforeyoutape.android.engine

import android.content.Context
import app.beforeyoutape.engine.EngineHost
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The rules bundle shipped in the app (assets/engine/: byt-engine.js, its build manifest and the
 * bundled rules edition). The host refuses a bundle whose SHA-256 differs from the manifest.
 */
object EngineAssets {
    private fun text(context: Context, name: String) = context.assets.open("engine/$name").bufferedReader().use { it.readText() }

    fun manifestSha256(context: Context): String =
        Json.parseToJsonElement(text(context, "manifest.json")).jsonObject.getValue("sha256").jsonPrimitive.content

    fun edition(context: Context): String = text(context, "edition.json")

    /** A host with the bundled edition loaded. [expectedSha256] is the manifest's unless a test passes another. */
    fun load(context: Context, expectedSha256: String = manifestSha256(context)): EngineHost {
        val host = EngineHost(QuickJsRuntime(), text(context, "byt-engine.js"), expectedSha256)
        host.setEdition(edition(context))
        return host
    }
}
