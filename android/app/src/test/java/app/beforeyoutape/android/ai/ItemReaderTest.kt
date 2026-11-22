package app.beforeyoutape.android.ai

import app.beforeyoutape.android.capture.CropImage
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import app.beforeyoutape.engine.TaggedRead
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ItemReaderTest {
    private val crop = object : CropImage { override val widthPx = 640; override val heightPx = 480 }
    private val wire = ItemReadWire("Lotion", ItemCategoryWire.lotion_cream, "SHEA LOTION", 0.0, 0.0, 0.0, 0.0,
        false, true, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)

    /** A fake model: each call takes the next scripted answer and records the mode it was asked for. */
    private class FakeModel(private val answers: List<(SdkMode) -> ModelReply>) : LabelModel {
        val modes = mutableListOf<SdkMode>()
        override suspend fun read(mode: SdkMode, crop: CropImage, prompt: String): ModelReply {
            modes += mode
            return answers[modes.size - 1](mode)
        }
    }

    private fun reply(source: Source) = { _: SdkMode -> ModelReply(wire, source, 120) }
    private fun fails(kind: CallFailure) = { _: SdkMode -> throw ModelCallException(kind, null) }

    private fun reader(model: LabelModel, gate: DeviceModelStatus, cloud: CloudState, parse: (String) -> TaggedRead = { TaggedRead(wire, emptyList()) }) =
        ItemReader(model, parse, gate = { gate }, cloud = { cloud }, prompt = { "prompt" }, signIn = {})

    private val consented = CloudState(consent = true, online = true, killCloud = false)
    private val noConsent = CloudState(consent = null, online = true, killCloud = false)

    /** The label's figures come from the model's whole label, before the parser cuts it, and ride with the read. */
    @Test fun aReadCarriesTheFiguresOfItsWholeLabel() = runTest {
        val whole = "x".repeat(170) + " 99Wh"
        val m = FakeModel(listOf({ _: SdkMode -> ModelReply(wire.copy(labelText = whole), Source.IN_CLOUD, 120) }))
        val seen = mutableListOf<String>()
        val figures = app.beforeyoutape.engine.LabelFigures(wh = listOf(99.0), grams = emptyList())
        val r = ItemReader(m, { TaggedRead(wire, emptyList()) }, gate = { DeviceModelStatus.UNAVAILABLE }, cloud = { consented },
            prompt = { "prompt" }, signIn = {}, figures = { seen += it; figures })
        val out = r.read(crop) as ReadOutcome.Read
        assertEquals(listOf(whole), seen)
        assertEquals(figures, out.labelFigures)
    }

    /** The parser's tags (from the whole label, before the cut) ride with the read to the box. */
    @Test fun aReadCarriesTheTagsTheParserGaveForItsWholeLabel() = runTest {
        val m = FakeModel(listOf(reply(Source.IN_CLOUD)))
        val out = reader(m, DeviceModelStatus.UNAVAILABLE, consented, parse = { TaggedRead(wire, listOf("flammable", "label_text")) }).read(crop)
        assertTrue("$out", out is ReadOutcome.Read)
        assertEquals(listOf("flammable", "label_text"), (out as ReadOutcome.Read).labelTags)
    }

    /** Cloud AI Logic requests can require a Firebase Auth ID token, so a route that can reach the cloud signs in first. */
    @Test fun aCloudOnlyReadSignsInBeforeTheModelCall() = runTest {
        val order = mutableListOf<String>()
        val m = object : LabelModel {
            override suspend fun read(mode: SdkMode, crop: CropImage, prompt: String): ModelReply {
                order += "model:$mode"
                return ModelReply(wire, Source.IN_CLOUD, 120)
            }
        }
        val r = ItemReader(m, { TaggedRead(wire, emptyList()) }, gate = { DeviceModelStatus.UNAVAILABLE }, cloud = { consented }, prompt = { "prompt" }, signIn = { order += "signin" })
        assertTrue(r.read(crop) is ReadOutcome.Read)
        assertEquals(listOf("signin", "model:ONLY_IN_CLOUD"), order)
    }

    @Test fun aFailedSignInWithNoModelOnThePhoneSendsNothing() = runTest {
        val m = FakeModel(emptyList())
        val r = ItemReader(m, { TaggedRead(wire, emptyList()) }, gate = { DeviceModelStatus.UNAVAILABLE }, cloud = { consented }, prompt = { "prompt" },
            signIn = { throw IllegalStateException("no network") })
        assertEquals(ReadOutcome.Failed(FailReason.CLOUD_ERROR, retryable = true), r.read(crop))
        assertEquals(0, m.modes.size)
    }

    @Test fun aFailedSignInWithAModelOnThePhoneReadsOnThePhoneOnly() = runTest {
        val m = FakeModel(listOf(reply(Source.ON_DEVICE)))
        val r = ItemReader(m, { TaggedRead(wire, emptyList()) }, gate = { DeviceModelStatus.AVAILABLE }, cloud = { consented }, prompt = { "prompt" },
            signIn = { throw IllegalStateException("no network") })
        val out = r.read(crop) as ReadOutcome.Read
        assertEquals(ReadRoute.DEVICE_ONLY, out.route)
        assertEquals(listOf(SdkMode.ONLY_ON_DEVICE), m.modes)
    }

    @Test fun theDeviceOnlyRouteNeverSignsIn() = runTest {
        var signIns = 0
        val m = FakeModel(listOf(reply(Source.ON_DEVICE)))
        val r = ItemReader(m, { TaggedRead(wire, emptyList()) }, gate = { DeviceModelStatus.AVAILABLE }, cloud = { noConsent }, prompt = { "prompt" }, signIn = { signIns++ })
        assertTrue(r.read(crop) is ReadOutcome.Read)
        assertEquals(0, signIns)
    }

    @Test fun withNoModelAndNoConsentNothingIsCalled() = runTest {
        val m = FakeModel(emptyList())
        val out = reader(m, DeviceModelStatus.UNAVAILABLE, noConsent).read(crop)
        assertEquals(ReadOutcome.Blocked(BlockReason.NO_MODEL_NO_CONSENT), out)
        assertEquals(0, m.modes.size)
    }

    @Test fun aBlockedReadSaysWhyTheCloudIsClosed() = runTest {
        val m = FakeModel(emptyList())
        assertEquals(ReadOutcome.Blocked(BlockReason.OFFLINE), reader(m, DeviceModelStatus.UNAVAILABLE, consented.copy(online = false)).read(crop))
        assertEquals(ReadOutcome.Blocked(BlockReason.CLOUD_PAUSED), reader(m, DeviceModelStatus.UNAVAILABLE, consented.copy(killCloud = true)).read(crop))
        assertEquals(0, m.modes.size)
    }

    @Test fun withAModelAndNoConsentOnlyThisPhoneIsUsed() = runTest {
        val m = FakeModel(listOf(reply(Source.ON_DEVICE)))
        val out = reader(m, DeviceModelStatus.AVAILABLE, noConsent).read(crop)
        assertEquals(listOf(SdkMode.ONLY_ON_DEVICE), m.modes)
        assertTrue(out is ReadOutcome.Read && out.route == ReadRoute.DEVICE_ONLY && out.source == Source.ON_DEVICE)
    }

    @Test fun aDeviceOnlyReplyFromTheCloudIsDiscardedAndReported() = runTest {
        val m = FakeModel(listOf(reply(Source.IN_CLOUD)))
        val out = reader(m, DeviceModelStatus.AVAILABLE, noConsent).read(crop)
        assertEquals(ReadOutcome.Failed(FailReason.DEVICE_REPLY_FROM_CLOUD, retryable = false), out)
    }

    @Test fun theGateIsCheckedImmediatelyBeforeEveryDeviceCall() = runTest {
        var status = DeviceModelStatus.AVAILABLE
        val m = FakeModel(listOf(reply(Source.ON_DEVICE), reply(Source.ON_DEVICE)))
        val r = ItemReader(m, { TaggedRead(wire, emptyList()) }, gate = { status }, cloud = { noConsent }, prompt = { "prompt" }, signIn = {})
        assertTrue(r.read(crop) is ReadOutcome.Read)
        status = DeviceModelStatus.UNAVAILABLE
        assertEquals(ReadOutcome.Blocked(BlockReason.NO_MODEL_NO_CONSENT), r.read(crop))
        assertEquals(listOf(SdkMode.ONLY_ON_DEVICE), m.modes)
    }

    @Test fun aHybridThrowRetriesOnceInTheCloud() = runTest {
        val m = FakeModel(listOf(fails(CallFailure.DEVICE), reply(Source.IN_CLOUD)))
        val out = reader(m, DeviceModelStatus.AVAILABLE, consented).read(crop)
        assertEquals(listOf(SdkMode.PREFER_ON_DEVICE, SdkMode.ONLY_IN_CLOUD), m.modes)
        assertTrue(out is ReadOutcome.Read && out.route == ReadRoute.HYBRID && out.source == Source.IN_CLOUD)
    }

    @Test fun aNetworkErrorOr429Or5xxIsRetriedOnce() = runTest {
        val once = FakeModel(listOf(fails(CallFailure.TRANSIENT), reply(Source.IN_CLOUD)))
        assertTrue(reader(once, DeviceModelStatus.UNAVAILABLE, consented).read(crop) is ReadOutcome.Read)
        assertEquals(listOf(SdkMode.ONLY_IN_CLOUD, SdkMode.ONLY_IN_CLOUD), once.modes)
        val twice = FakeModel(listOf(fails(CallFailure.TRANSIENT), fails(CallFailure.TRANSIENT)))
        assertEquals(ReadOutcome.Failed(FailReason.CLOUD_ERROR, retryable = true), reader(twice, DeviceModelStatus.UNAVAILABLE, consented).read(crop))
        assertEquals(2, twice.modes.size)
        val other = FakeModel(listOf(fails(CallFailure.OTHER)))
        assertEquals(ReadOutcome.Failed(FailReason.CLOUD_ERROR, retryable = false), reader(other, DeviceModelStatus.UNAVAILABLE, consented).read(crop))
        assertEquals(1, other.modes.size)
    }

    @Test fun threeRefusalsInARowPauseTheRun() = runTest {
        val m = FakeModel(List(3) { fails(CallFailure.REFUSED) })
        val r = reader(m, DeviceModelStatus.UNAVAILABLE, consented)
        repeat(3) { assertEquals(ReadOutcome.Failed(FailReason.REFUSED, retryable = true), r.read(crop)) }
        assertEquals(ReadOutcome.Blocked(BlockReason.REFUSALS_PAUSED), r.read(crop))
        assertEquals(3, m.modes.size)
    }

    @Test fun aReadThatFailsTheTsParserIsNotAdded() = runTest {
        val m = FakeModel(listOf(reply(Source.IN_CLOUD)))
        val out = reader(m, DeviceModelStatus.UNAVAILABLE, consented, parse = { throw IllegalArgumentException("InvalidReadError") }).read(crop)
        assertEquals(ReadOutcome.Failed(FailReason.UNREADABLE, retryable = true), out)
    }

    @Test fun aReplyWithNoObjectIsUnreadable() = runTest {
        val m = FakeModel(listOf({ _: SdkMode -> ModelReply(null, Source.IN_CLOUD, 50) }))
        assertEquals(ReadOutcome.Failed(FailReason.UNREADABLE, retryable = true), reader(m, DeviceModelStatus.UNAVAILABLE, consented).read(crop))
    }
}
