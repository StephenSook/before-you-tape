package app.beforeyoutape.android.ai

import app.beforeyoutape.android.capture.CropImage
import app.beforeyoutape.engine.ItemReadWire
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json

enum class BlockReason { NO_MODEL_NO_CONSENT, OFFLINE, CLOUD_PAUSED, REFUSALS_PAUSED }

enum class FailReason { UNREADABLE, REFUSED, DEVICE_REPLY_FROM_CLOUD, DEVICE_ERROR, CLOUD_ERROR }

sealed interface ReadOutcome {
    data class Read(val read: ItemReadWire, val source: Source, val route: ReadRoute, val ms: Long) : ReadOutcome
    data class Blocked(val reason: BlockReason) : ReadOutcome
    data class Failed(val reason: FailReason, val retryable: Boolean) : ReadOutcome
}

/**
 * One label read, with the guard. The on-device model's status is checked immediately before every
 * read; the cloud is used only when it is allowed (consent, online, kill_cloud off); a device-only
 * reply that came from the cloud is discarded; a hybrid failure is retried once in the cloud, and a
 * network error, 429 or 5xx once; three refusals in a row pause the run. Every reply goes through
 * the web app's own parser before it can be added to the box.
 */
class ItemReader(
    private val model: LabelModel,
    private val parse: (String) -> ItemReadWire,
    private val gate: suspend () -> DeviceModelStatus,
    private val cloud: () -> CloudState,
    private val prompt: () -> String,
) {
    private val json = Json
    private var refusalsInARow = 0

    /** A new run (a new box or the sender asking again) clears the refusal pause. */
    fun resetRun() {
        refusalsInARow = 0
    }

    suspend fun read(crop: CropImage): ReadOutcome {
        if (refusalsInARow >= 3) return ReadOutcome.Blocked(BlockReason.REFUSALS_PAUSED)
        val c = cloud()
        val route = ReadRoutes.choose(gate(), ReadRoutes.cloudAllowed(c))
        val t0 = System.nanoTime()
        val reply = try {
            when (route) {
                ReadRoute.BLOCKED -> return ReadOutcome.Blocked(blockReason(c))
                ReadRoute.DEVICE_ONLY -> model.read(SdkMode.ONLY_ON_DEVICE, crop, prompt()).also {
                    if (it.source != Source.ON_DEVICE) return ReadOutcome.Failed(FailReason.DEVICE_REPLY_FROM_CLOUD, retryable = false)
                }
                ReadRoute.HYBRID -> try {
                    model.read(SdkMode.PREFER_ON_DEVICE, crop, prompt())
                } catch (e: ModelCallException) {
                    if (e.failure == CallFailure.REFUSED) throw e
                    // One retry in the cloud, only if the cloud is still allowed now.
                    val now = cloud()
                    if (!ReadRoutes.cloudAllowed(now)) return ReadOutcome.Blocked(blockReason(now))
                    model.read(SdkMode.ONLY_IN_CLOUD, crop, prompt())
                }
                ReadRoute.CLOUD_ONLY -> try {
                    model.read(SdkMode.ONLY_IN_CLOUD, crop, prompt())
                } catch (e: ModelCallException) {
                    if (e.failure != CallFailure.TRANSIENT) throw e
                    model.read(SdkMode.ONLY_IN_CLOUD, crop, prompt())
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: CloudPausedException) {
            return ReadOutcome.Blocked(BlockReason.CLOUD_PAUSED)
        } catch (e: ModelCallException) {
            return failed(e.failure, route)
        }
        val read = reply.read ?: return ReadOutcome.Failed(FailReason.UNREADABLE, retryable = true)
        val parsed = try {
            parse(json.encodeToString(ItemReadWire.serializer(), read))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return ReadOutcome.Failed(FailReason.UNREADABLE, retryable = true)
        }
        refusalsInARow = 0
        return ReadOutcome.Read(parsed, reply.source, route, (System.nanoTime() - t0) / 1_000_000)
    }

    private fun failed(f: CallFailure, route: ReadRoute): ReadOutcome = when (f) {
        CallFailure.REFUSED -> {
            refusalsInARow++
            ReadOutcome.Failed(FailReason.REFUSED, retryable = true)
        }
        CallFailure.TRANSIENT -> ReadOutcome.Failed(FailReason.CLOUD_ERROR, retryable = true)
        CallFailure.DEVICE -> if (route == ReadRoute.DEVICE_ONLY) ReadOutcome.Failed(FailReason.DEVICE_ERROR, retryable = true)
        else ReadOutcome.Failed(FailReason.CLOUD_ERROR, retryable = true)
        CallFailure.OTHER -> ReadOutcome.Failed(FailReason.CLOUD_ERROR, retryable = false)
    }

    private fun blockReason(c: CloudState): BlockReason = when {
        c.consent != true -> BlockReason.NO_MODEL_NO_CONSENT
        !c.online -> BlockReason.OFFLINE
        else -> BlockReason.CLOUD_PAUSED
    }
}
