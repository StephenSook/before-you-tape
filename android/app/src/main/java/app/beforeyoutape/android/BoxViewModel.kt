package app.beforeyoutape.android

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.beforeyoutape.android.ai.AiClient
import app.beforeyoutape.android.ai.CloudState
import app.beforeyoutape.android.ai.DeviceModelStatus
import app.beforeyoutape.android.ai.FailReason
import app.beforeyoutape.android.ai.ItemReader
import app.beforeyoutape.android.ai.Prompts
import app.beforeyoutape.android.ai.ReadOutcome
import app.beforeyoutape.android.box.BoxController
import app.beforeyoutape.android.box.BoxEngine
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.android.box.BoxSession
import app.beforeyoutape.android.capture.BitmapCrop
import app.beforeyoutape.android.config.FirebaseRcSource
import app.beforeyoutape.android.config.RcStore
import app.beforeyoutape.android.data.FirebaseSignIn
import app.beforeyoutape.android.data.LocalStore
import app.beforeyoutape.android.data.SharedPrefs
import app.beforeyoutape.android.engine.EngineAssets
import app.beforeyoutape.android.ui.Copy
import app.beforeyoutape.android.ui.HomeActions
import app.beforeyoutape.android.ui.HomeNav
import app.beforeyoutape.android.ui.HomeUi
import app.beforeyoutape.android.ui.HomeView
import app.beforeyoutape.android.ui.ReadDraft
import app.beforeyoutape.android.ui.ReadDrafts
import app.beforeyoutape.engine.EngineError
import app.beforeyoutape.engine.EngineHost
import app.beforeyoutape.engine.ItemReadWire
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.util.UUID

/**
 * Holds the box on this phone and connects the screens to the rules engine, the reader and the
 * phone's own settings. Every box change runs on one worker thread, and the screen gets a new
 * [HomeUi] after each.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BoxViewModel(app: Application) : AndroidViewModel(app), HomeActions {
    private val store = LocalStore(SharedPrefs(app))
    private val rc: RcStore? = if (FirebaseApp.getApps(app).isNotEmpty()) RcStore(FirebaseRcSource(Firebase.remoteConfig)).also { it.start() } else null
    private val ai: AiClient? = rc?.let { r -> AiClient { r.current() } }
    private val worker = Dispatchers.Default.limitedParallelism(1)
    private var host: EngineHost? = null

    private val box = BoxController(BoxLogic.empty(store.destination() ?: ""), BoxEngine { items, code, today ->
        (host ?: throw EngineError("EngineNotLoaded", "the rules are not loaded")).evaluateBox(items, code, today)
    }, today = { LocalDate.now().toString() })

    private val reader: ItemReader? = ai?.let { client ->
        ItemReader(
            model = client,
            parse = { text -> requireNotNull(host).parseItemRead(text) },
            gate = { client.deviceStatus() },
            cloud = { CloudState(store.cloudConsent(), online(), rc?.current()?.killCloud ?: true) },
            prompt = { Prompts.ITEM_READ_PROMPT },
            signIn = { FirebaseSignIn.ensureSignedIn() },
        )
    }

    private val session = BoxSession(
        box,
        reader = { crop -> reader?.read(crop) ?: ReadOutcome.Failed(FailReason.CLOUD_ERROR, retryable = false) },
        tags = { text -> host?.labelTags(text) ?: emptyList() },
        newId = { UUID.randomUUID().toString() },
        resetRun = { reader?.resetRun() },
    )

    private val state = MutableStateFlow(
        HomeUi(
            loading = true, destinations = emptyList(), box = box.state, consent = store.cloudConsent(), deviceModelReady = false,
            busy = false, message = null, view = HomeView.CAMERA, fixRead = null,
        ),
    )
    val ui: StateFlow<HomeUi> = state

    init {
        viewModelScope.launch(worker) {
            // The bundled rules: the host checks the bundle's hash, and setEdition lists the destinations.
            val loaded = runCatching { EngineAssets.load(app).let { h -> h to h.setEdition(EngineAssets.edition(app)).destinations } }.getOrNull()
            host = loaded?.first
            state.update {
                it.copy(loading = false, destinations = loaded?.second.orEmpty(), box = box.state, message = if (loaded == null) Copy.RULES_NOT_LOADED else null)
            }
        }
        viewModelScope.launch {
            val status = ai?.deviceStatus() ?: DeviceModelStatus.UNAVAILABLE
            state.update { it.copy(deviceModelReady = status == DeviceModelStatus.AVAILABLE) }
        }
    }

    private fun online(): Boolean {
        val cm = getApplication<Application>().getSystemService(ConnectivityManager::class.java) ?: return false
        return cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    private fun onWorker(work: suspend () -> Unit) {
        viewModelScope.launch(worker) { work() }
    }

    private fun publish(change: (HomeUi) -> HomeUi = { it }) = state.update { change(it).copy(box = box.state) }

    override fun destination(code: String) {
        store.setDestination(code)
        onWorker {
            box.setDestination(code)
            publish()
        }
    }

    override fun consent(allowed: Boolean) {
        store.setCloudConsent(allowed)
        publish { it.copy(consent = allowed) }
    }

    override fun crop(crop: BitmapCrop) {
        if (state.value.busy) return
        publish { it.copy(busy = true, message = null) }
        onWorker {
            val message = session.check(crop)
            publish { HomeNav.afterCheck(it, message) }
        }
    }

    override fun photoFailed() = publish { it.copy(message = Copy.PHOTO_FAILED) }

    override fun show(view: HomeView) {
        // Going back to the camera starts a new scan session (lifts a refusal pause).
        // On the worker, where reads count refusals.
        if (view == HomeView.CAMERA && state.value.view != HomeView.CAMERA) onWorker { session.startNewScan() }
        publish { it.copy(view = view, message = null) }
    }

    override fun typed(draft: ReadDraft) {
        val read = ReadDrafts.read(draft) ?: return
        onWorker {
            val h = host ?: return@onWorker publish { it.copy(message = Copy.RULES_NOT_LOADED) }
            // A typed item goes through the web app's own read parser, like a model read.
            val parsed = h.parseItemRead(Json.encodeToString(ItemReadWire.serializer(), read))
            box.addManual(parsed, h.labelTags(parsed.labelText), UUID.randomUUID().toString())
            publish { it.copy(view = HomeView.BOX, message = null) }
        }
    }

    override fun fix(itemId: String) {
        val input = box.state.items.firstOrNull { it.input.itemId == itemId }?.input ?: return
        publish { it.copy(view = HomeView.FIX, fixItemId = itemId, fixRead = BoxLogic.effectiveRead(input), message = null) }
    }

    override fun fixed(itemId: String, draft: ReadDraft) {
        onWorker {
            val input = box.state.items.firstOrNull { it.input.itemId == itemId }?.input ?: return@onWorker
            val patch = ReadDrafts.changed(BoxLogic.effectiveRead(input), draft)
            val tags = if ("labelText" in patch) host?.labelTags(draft.labelText) ?: emptyList() else null
            if (patch.isNotEmpty()) box.override(itemId, patch, tags)
            publish { it.copy(view = HomeView.BOX, fixItemId = null, fixRead = null) }
        }
    }

    override fun answer(itemId: String, questionId: String, answerId: String) = onWorker {
        box.answer(itemId, questionId, answerId)
        publish()
    }

    override fun quantity(itemId: String, step: Int) = onWorker {
        box.stepQuantity(itemId, step)
        publish()
    }

    override fun remove(itemId: String) = onWorker {
        box.remove(itemId)
        publish()
    }

    override fun onCleared() {
        host?.close()
    }
}
