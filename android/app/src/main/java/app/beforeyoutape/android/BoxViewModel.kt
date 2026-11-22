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
import app.beforeyoutape.android.ai.LatestCheck
import app.beforeyoutape.android.ai.ModelReadiness
import app.beforeyoutape.android.ai.ModelDownload
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
import app.beforeyoutape.android.data.BoxPersistence
import app.beforeyoutape.android.data.LocalStore
import app.beforeyoutape.android.data.SavedBox
import app.beforeyoutape.android.data.SharedPrefs
import app.beforeyoutape.android.engine.EngineAssets
import app.beforeyoutape.android.engine.PublishedEditions
import app.beforeyoutape.android.ui.AboutInfo
import app.beforeyoutape.android.ui.Copy
import app.beforeyoutape.android.ui.HomeActions
import app.beforeyoutape.android.ui.HomeNav
import app.beforeyoutape.android.ui.HomeUi
import app.beforeyoutape.android.ui.HomeView
import app.beforeyoutape.android.ui.ReadDraft
import app.beforeyoutape.android.ui.ReadDrafts
import app.beforeyoutape.engine.EditionCheck
import app.beforeyoutape.engine.EditionChoice
import app.beforeyoutape.engine.EditionPin
import app.beforeyoutape.engine.EngineError
import app.beforeyoutape.engine.EngineHost
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.PinnedEdition
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
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
    private val persistence = BoxPersistence(SharedPrefs(app))

    private val modelChecks = LatestCheck()
    @Volatile private var downloadActive = false
    @Volatile private var launchChecked = false

    // Nothing is saved until the saved box is restored, so an early change cannot overwrite it.
    @Volatile private var restored = false
    private val rc: RcStore? = if (FirebaseApp.getApps(app).isNotEmpty()) RcStore(FirebaseRcSource(Firebase.remoteConfig)).also { it.start() } else null
    private val ai: AiClient? = rc?.let { r -> AiClient { r.current() } }
    /** True while this build is older than Remote Config's minimum_version_android: the app shows only the update screen. */
    val needsUpdate: StateFlow<Boolean> = rc?.values?.map { it.needsUpdate(BuildConfig.VERSION_NAME) }
        ?.stateIn(viewModelScope, SharingStarted.Eagerly, false) ?: MutableStateFlow(false)
    private val worker = Dispatchers.Default.limitedParallelism(1)
    private var host: EngineHost? = null

    // The bundled edition, and the one in use: a newer one named by the Remote Config pin may replace it.
    @Volatile private var bundledEdition: PinnedEdition? = null
    @Volatile private var runningEdition: PinnedEdition? = null
    private val pinChecks = LatestCheck()
    private val engineLoaded = CompletableDeferred<Unit>()

    private val box = BoxController(
        BoxLogic.empty(store.destination() ?: ""),
        BoxEngine { items, code, today -> (host ?: throw EngineError("EngineNotLoaded", "the rules are not loaded")).evaluateBox(items, code, today) },
        today = { LocalDate.now().toString() },
        // The edition in use, so an item tagged under another edition's label words is held.
        edition = { runningEdition?.editionId },
    )

    private val reader: ItemReader? = ai?.let { client ->
        ItemReader(
            model = client,
            parse = { text -> requireNotNull(host).parseItemReadTagged(text) },
            gate = { client.deviceStatus() },
            cloud = { CloudState(store.cloudConsent(), online(), rc?.current()?.killCloud ?: true) },
            prompt = { Prompts.ITEM_READ_PROMPT },
            signIn = { FirebaseSignIn.ensureSignedIn() },
            // The engine's own figure parser, on the whole label before the parser clips it.
            figures = { label -> requireNotNull(host).labelFigures(listOf(label)) },
        )
    }

    private val session = BoxSession(
        box,
        reader = { crop -> reader?.read(crop) ?: ReadOutcome.Failed(FailReason.CLOUD_ERROR, retryable = false) },
        newId = { UUID.randomUUID().toString() },
        resetRun = { reader?.resetRun() },
    )

    private val state = MutableStateFlow(
        HomeUi(
            loading = true, destinations = emptyList(), box = box.state, consent = store.cloudConsent(), deviceModel = DeviceModelStatus.UNKNOWN,
            busy = false, message = null, view = HomeView.CAMERA, fixRead = null,
        ),
    )
    val ui: StateFlow<HomeUi> = state

    init {
        viewModelScope.launch(worker) {
            // The bundled rules: the host checks the bundle's hash, and setEdition lists the destinations.
            val loaded = runCatching {
                val h = EngineAssets.load(app)
                val json = EngineAssets.edition(app)
                val pinned = requireNotNull(EditionCheck.verify(h, json)) { "the bundled edition did not load" }
                Triple(h, h.setEdition(json).destinations, pinned)
            }.getOrNull()
            host = loaded?.first
            bundledEdition = loaded?.third
            runningEdition = loaded?.third
            engineLoaded.complete(Unit)
            // The box from before Android stopped the process, re-checked by the rules. A save this build cannot read
            // is kept, and the box is not called empty, until an item is added.
            (persistence.read() as? SavedBox.Found)?.let { box.restore(it.state) }
            restored = true
            state.update {
                it.copy(
                    loading = false, destinations = loaded?.second.orEmpty(), box = box.state, boxUnreadable = boxUnreadable(),
                    message = if (loaded == null) Copy.RULES_NOT_LOADED else null,
                )
            }
        }
        refreshModel()
        followEditionPin()
    }

    /**
     * Follows the Remote Config edition pin, as the web app does. Each pin change is checked off the
     * worker (the fetch and a spare host's verification), and only the newest check may apply.
     */
    private fun followEditionPin() {
        val values = rc?.values ?: return
        viewModelScope.launch(Dispatchers.Default) {
            values.map { it.rulesEditionId to it.rulesEditionSha256 }.distinctUntilChanged().collectLatest { (id, sha) ->
                val check = pinChecks.begin()
                // The bundled edition loads on the worker; wait for it before following the pin.
                engineLoaded.await()
                val bundled = bundledEdition ?: return@collectLatest
                val choice = EditionPin.choose(bundled, runningEdition ?: bundled, id, sha, PublishedEditions::fetch, ::verifyOnSpareHost)
                applyEdition(choice, check)
            }
        }
    }

    /** Verifies an edition on a fresh host, so the rules in use never change before the checks pass. */
    private fun verifyOnSpareHost(json: String): PinnedEdition? =
        runCatching { EngineAssets.load(getApplication()).use { EditionCheck.verify(it, json) } }.getOrNull()

    private fun applyEdition(choice: EditionChoice, check: Long) = onWorker {
        if (!pinChecks.isLatest(check)) return@onWorker
        val h = host ?: return@onWorker
        if (choice.edition.editionId != runningEdition?.editionId) {
            // The live host keeps its rules when it refuses an edition, so a failure here changes nothing.
            val destinations = runCatching { h.setEdition(choice.edition.json).destinations }.getOrNull()
                ?: return@onWorker publish { it.copy(message = EditionPin.NOT_READ) }
            runningEdition = choice.edition
            box.rulesChanged()
            publish { it.copy(destinations = destinations, message = choice.notice ?: it.message) }
        } else if (choice.notice != null) {
            publish { it.copy(message = choice.notice) }
        }
    }

    /** Wi-Fi or another network that is not billed by the byte. */
    private fun unmetered(): Boolean {
        val cm = getApplication<Application>().getSystemService(ConnectivityManager::class.java) ?: return false
        return cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true
    }

    private fun online(): Boolean {
        val cm = getApplication<Application>().getSystemService(ConnectivityManager::class.java) ?: return false
        return cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    /**
     * Every box change runs here, on the one worker thread, and the box is saved right after it.
     * Saving only here keeps the saved box in step with the changes: a save from another thread could
     * write an older box over a newer one.
     */
    private fun onWorker(work: suspend () -> Unit): Job =
        viewModelScope.launch(worker) {
            work()
            if (restored) persistence.save(box.state)
        }

    /** Shows the current box. Runs on any thread, so it never saves. */
    private fun publish(change: (HomeUi) -> HomeUi = { it }) {
        state.update { change(it).copy(box = box.state, boxUnreadable = boxUnreadable()) }
    }

    /** Empty beside a save this build could not read: the box is not known to be empty. */
    private fun boxUnreadable() = persistence.holdsUnreadable && box.state.items.isEmpty()

    override fun destination(code: String) {
        store.setDestination(code)
        onWorker {
            box.setDestination(code)
            publish()
        }
    }

    /** The read under way, so withdrawing consent can cancel it: its result is dropped and nothing more is sent. */
    private var readJob: Job? = null

    override fun turnOffCloud() {
        readJob?.cancel()
        readJob = null
        store.setCloudConsent(false)
        publish { it.copy(consent = false, busy = false, about = it.about?.copy(cloudConsent = false)) }
    }

    override fun askConsentAgain() {
        store.clearCloudConsent()
        publish { it.copy(consent = null, view = HomeView.CAMERA, about = null) }
    }

    override fun consent(allowed: Boolean) {
        store.setCloudConsent(allowed)
        publish { it.copy(consent = allowed) }
    }

    override fun crop(crop: BitmapCrop) {
        if (state.value.busy) return
        publish { it.copy(busy = true, message = null) }
        // The crop belongs to the scan session current now, even if it waits on the worker.
        val scan = session.currentScan()
        readJob = onWorker {
            val message = session.check(crop, scan)
            // Consent was withdrawn while the read ran: drop its result.
            currentCoroutineContext().ensureActive()
            publish { HomeNav.afterCheck(it, message) }
        }
    }

    override fun photoFailed() = publish { it.copy(message = Copy.PHOTO_FAILED) }

    override fun show(view: HomeView) {
        // Going back to the camera starts a new scan session; its first read lifts a refusal pause.
        if (view == HomeView.CAMERA && state.value.view != HomeView.CAMERA) session.startNewScan()
        val about = if (view == HomeView.ABOUT) aboutInfo() else null
        publish { it.copy(view = view, message = null, about = about ?: it.about) }
    }

    /** What About this phone shows, read when it opens. */
    private fun aboutInfo(): AboutInfo {
        val app = getApplication<Application>()
        fun asset(read: () -> String) = runCatching(read).getOrDefault("unknown")
        return AboutInfo(
            deviceModel = state.value.deviceModel,
            cloudModel = rc?.current()?.cloudModelItem?.ifEmpty { null } ?: "not set",
            appCheckProvider = AppCheckSetup.PROVIDER,
            editionId = runningEdition?.editionId ?: asset { EngineAssets.editionId(app) },
            bundleCommit = asset { EngineAssets.manifestCommit(app) },
            bundleSha256 = asset { EngineAssets.manifestSha256(app) },
            version = runCatching { app.packageManager.getPackageInfo(app.packageName, 0).versionName }.getOrNull() ?: "unknown",
            cloudConsent = store.cloudConsent(),
        )
    }

    override fun typed(draft: ReadDraft) {
        val read = ReadDrafts.read(draft) ?: return
        onWorker {
            val h = host ?: return@onWorker publish { it.copy(message = Copy.RULES_NOT_LOADED) }
            // A typed item goes through the web app's own read parser, like a model read, and keeps the tags
            // of its whole label.
            val parsed = h.parseItemReadTagged(Json.encodeToString(ItemReadWire.serializer(), read))
            // Its figures, too, come from the whole typed label.
            box.addManual(parsed.read, parsed.labelTags, UUID.randomUUID().toString(), h.labelFigures(listOf(read.labelText)))
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
            // Only what the sender typed, with the numbers a typed Wh or lithium grams brings (rule edition 7).
            val patch = BoxLogic.withCompanions(input, ReadDrafts.changed(BoxLogic.effectiveRead(input), draft))
            val tags = if ("labelText" in patch) host?.labelTags(draft.labelText) ?: emptyList() else null
            // Typed label words bring their figures, merged by the engine with the ones the item keeps.
            val figures = if ("labelText" in patch) host?.labelFigures(BoxLogic.figureTexts(input, draft.labelText), input.labelFigures) else null
            if (patch.isNotEmpty()) box.override(itemId, patch, tags, figures)
            publish { it.copy(view = HomeView.BOX, fixItemId = null, fixRead = null) }
        }
    }

    override fun answer(itemId: String, questionId: String, answerId: String) {
        onWorker {
            box.answer(itemId, questionId, answerId)
            publish()
        }
    }

    override fun confirmNumber(itemId: String, field: String, value: Double) {
        onWorker {
            val input = box.state.items.firstOrNull { it.input.itemId == itemId }?.input ?: return@onWorker
            // The tolerance is the running edition's own; with none, nothing matches and the typed number is saved alone.
            val patch = BoxLogic.labelNumberPatch(input, field, value, BoxLogic.whTolerancePct(runningEdition?.json)) ?: return@onWorker
            box.override(itemId, patch, null)
            publish()
        }
    }

    override fun quantity(itemId: String, step: Int) {
        onWorker {
            box.stepQuantity(itemId, step)
            publish()
        }
    }

    /** Re-checks the on-device model: at start and whenever the app comes back to the front. */
    fun refreshModel() {
        // Only the most recently started check may update the screen: an older one finishing last
        // (say, a resume check during a download) would otherwise put back a stale status.
        val check = modelChecks.begin()
        viewModelScope.launch {
            val status = ai?.deviceStatus() ?: DeviceModelStatus.UNAVAILABLE
            if (modelChecks.isLatest(check)) state.update { it.copy(deviceModel = ModelReadiness.shown(status, downloadActive)) }
            // Once, at launch: a downloadable model starts on Wi-Fi; on mobile data the app asks first.
            if (!launchChecked) {
                launchChecked = true
                if (ModelReadiness.startsAtLaunch(status, unmetered())) getModel()
            }
        }
    }

    override fun getModel() {
        val client = ai ?: return
        if (downloadActive) return
        downloadActive = true
        state.update { it.copy(deviceModel = DeviceModelStatus.DOWNLOADING) }
        viewModelScope.launch {
            try {
                ModelReadiness.collectDownload(client.downloadModel()) { state.update { it.copy(message = Copy.MODEL_DOWNLOAD_FAILED) } }
            } finally {
                downloadActive = false
                refreshModel()
            }
        }
    }

    override fun remove(itemId: String) {
        onWorker {
            box.remove(itemId)
            publish()
        }
    }

    override fun onCleared() {
        host?.close()
    }
}
