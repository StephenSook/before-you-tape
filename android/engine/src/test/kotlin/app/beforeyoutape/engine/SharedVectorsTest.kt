package app.beforeyoutape.engine

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The web app's shared vectors, run against the bundled engine in QuickJS (gate G-A0). */
class SharedVectorsTest {
    companion object {
        private val host = RepoFiles.host()
        private var boxRun = 0
        private var guardRun = 0
        private var destinationRun = 0

        @JvmStatic @AfterClass fun closeHost() = host.close()
    }

    @Test fun everyBoxVectorGivesItsVerdict() {
        val failures = Vectors.box.flatMap { boxRun++; Vectors.checkBox(host, it) }
        assertEquals(emptyList<String>(), failures)
        assertEquals(Vectors.box.size, boxRun)
    }

    @Test fun everyGuardVectorGivesItsVerdict() {
        val failures = Vectors.guards.flatMap { guardRun++; Vectors.checkBox(host, it) }
        assertEquals(emptyList<String>(), failures)
        assertEquals(Vectors.guards.size, guardRun)
    }

    @Test fun everyDestinationVectorGivesItsHits() {
        val failures = Vectors.destinations.mapNotNull { destinationRun++; Vectors.checkDestination(host, it) }
        assertEquals(emptyList<String>(), failures)
        assertEquals(Vectors.destinations.size, destinationRun)
    }

    @Test fun theVectorCountsMatchTheFiles() {
        assertTrue("box ${Vectors.box.size}", Vectors.box.size >= 20)
        assertTrue("guards ${Vectors.guards.size}", Vectors.guards.size >= 64)
        assertTrue("destinations ${Vectors.destinations.size}", Vectors.destinations.size >= 21)
        assertEquals(Vectors.box.size, RepoFiles.array("tests/vectors/box.json").size)
        assertEquals(Vectors.guards.size, RepoFiles.array("tests/vectors/box-guards.json").size)
        assertEquals(Vectors.destinations.size, RepoFiles.array("tests/vectors/destinations.json").size)
    }

    @Test fun aPlantedWrongExpectationFails() {
        val v = Vectors.box.first()
        val expect = v.getValue("expect").jsonObject
        val (id, level) = expect.entries.first()
        val wrong = if (level.jsonPrimitive.content == "ok") "take_out" else "ok"
        val planted = JsonObject(v + ("expect" to JsonObject(expect + (id to JsonPrimitive(wrong)))))
        val failures = Vectors.checkBox(host, planted)
        assertEquals(1, failures.size)
        assertTrue(failures.single(), failures.single().startsWith("${v.getValue("name").jsonPrimitive.content} $id: level"))
    }

    @Test fun everyGuardVectorPinsEveryItem() {
        for (g in Vectors.guards) {
            val ids = g.getValue("items").jsonArray.map { it.jsonObject.getValue("itemId").jsonPrimitive.content }.sorted()
            assertEquals(g.getValue("name").jsonPrimitive.content, ids, g.getValue("expect").jsonObject.keys.sorted())
        }
    }
}
