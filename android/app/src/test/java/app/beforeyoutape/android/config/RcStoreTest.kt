package app.beforeyoutape.android.config

import org.junit.Assert.assertEquals
import org.junit.Test

class RcStoreTest {
    private class FakeSource(var map: Map<String, String>, var fetched: Boolean = true) : RcSource {
        var onChange: (() -> Unit)? = null
        override fun snapshot() = map
        override fun fetchedActive() = fetched
        override fun start(onChange: () -> Unit) {
            this.onChange = onChange
        }
    }

    /** Before Remote Config or its defaults load, no cloud model is set, so no cloud read can start. */
    @Test fun beforeAnythingLoadsThereIsNoCloudModel() {
        val store = RcStore(FakeSource(emptyMap()))
        assertEquals("", store.current().cloudModelItem)
    }

    /**
     * Before a fetched value is active, only the in-app defaults are known, and their kill_cloud is
     * false; the cloud stays off until the server's own value is in force.
     */
    @Test fun theCloudIsHeldUntilAFetchedValueIsActive() {
        val source = FakeSource(RcDefaultsTest.xmlDefaults(), fetched = false)
        val store = RcStore(source)
        store.start()
        assertEquals(true, store.current().killCloud)
        source.fetched = true
        source.onChange!!.invoke()
        assertEquals(false, store.current().killCloud)
    }

    @Test fun aLiveUpdateIsPublished() {
        val source = FakeSource(RcDefaultsTest.xmlDefaults())
        val store = RcStore(source)
        store.start()
        assertEquals(false, store.current().killCloud)
        source.map = source.map + ("kill_cloud" to "true")
        source.onChange!!.invoke()
        assertEquals(true, store.current().killCloud)
        assertEquals(true, store.values.value.killCloud)
    }
}
