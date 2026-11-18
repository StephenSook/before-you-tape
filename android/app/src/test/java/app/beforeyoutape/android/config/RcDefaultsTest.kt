package app.beforeyoutape.android.config

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

class RcDefaultsTest {
    companion object {
        /** The in-app Remote Config defaults, read from the XML the app ships. */
        fun xmlDefaults(): Map<String, String> {
            val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/res/xml/remote_config_defaults.xml"))
            val entries = doc.getElementsByTagName("entry")
            return (0 until entries.length).associate { i ->
                val e = entries.item(i)
                val key = e.childNodes.let { n -> (0 until n.length).map { n.item(it) }.first { it.nodeName == "key" }.textContent.trim() }
                val value = e.childNodes.let { n -> (0 until n.length).map { n.item(it) }.first { it.nodeName == "value" }.textContent.trim() }
                key to value
            }
        }
    }

    @Test fun everyKeyTheParserReadsHasADefaultInTheXml() {
        assertEquals(RcValues.KEYS.sorted(), xmlDefaults().keys.sorted())
    }

    /** Keys the web template also holds keep the template's default, so the phone and the web start the same. */
    @Test fun sharedKeysMatchTheWebTemplateDefaults() {
        val params = Json.parseToJsonElement(File("../../remoteconfig.template.json").readText()).jsonObject.getValue("parameters").jsonObject
        val shared = xmlDefaults().filterKeys { it in params }
        assertEquals(setOf("cloud_model_item", "kill_cloud", "minimum_version_android"), shared.keys)
        for ((k, v) in shared) {
            val web = params.getValue(k).jsonObject.getValue("defaultValue").jsonObject.getValue("value").jsonPrimitive.content
            assertEquals(k, web, v)
        }
    }
}
