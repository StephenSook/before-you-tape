package app.beforeyoutape.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.beforeyoutape.android.box.BoxState
import app.beforeyoutape.android.capture.BitmapCrop
import app.beforeyoutape.engine.DestinationName
import app.beforeyoutape.engine.ItemReadWire

enum class HomeView { CAMERA, TYPE, BOX, FIX }

/** Everything the home screen shows; the view model makes it, tests write it by hand. */
data class HomeUi(
    val loading: Boolean,
    val destinations: List<DestinationName>,
    val box: BoxState,
    val consent: Boolean?,
    val deviceModelReady: Boolean,
    val busy: Boolean,
    val message: String?,
    val view: HomeView,
    val fixRead: ItemReadWire?,
    val fixItemId: String? = null,
)

/** Where the screen goes when a read finishes. */
object HomeNav {
    /**
     * A read that lands while the person is still on the camera shows the box. If they have moved
     * on (typing an item, fixing one, looking at the box), they stay where they are, so a slow read
     * never closes a form they are filling in. A failed read keeps them where they are and says why.
     */
    fun afterCheck(ui: HomeUi, message: String?): HomeUi =
        ui.copy(busy = false, message = message, view = if (message == null && ui.view == HomeView.CAMERA) HomeView.BOX else ui.view)
}

interface HomeActions {
    fun destination(code: String)
    fun consent(allowed: Boolean)
    fun crop(crop: BitmapCrop)
    fun photoFailed()
    fun show(view: HomeView)
    fun typed(draft: ReadDraft)
    fun fix(itemId: String)
    fun fixed(itemId: String, draft: ReadDraft)
    fun answer(itemId: String, questionId: String, answerId: String)
    fun remove(itemId: String)
    /** One tap: 1 for one more, -1 for one fewer. */
    fun quantity(itemId: String, step: Int)
}

/**
 * The app: where the box is going, the consent question once, then the camera (or typing), and
 * the box with the engine's verdicts. [camera] is the camera screen; tests pass a stand-in.
 */
@Composable
fun HomeScreen(ui: HomeUi, actions: HomeActions, camera: @Composable () -> Unit, modifier: Modifier = Modifier) {
    val chosen = ui.destinations.firstOrNull { it.code == ui.box.destinationCode }
    Column(modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        DestinationPicker(chosen, ui.destinations, actions::destination)
        ui.message?.let {
            Text(it, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                ui.loading -> Text(Copy.LOADING, style = MaterialTheme.typography.bodyLarge)
                ui.consent == null -> ConsentScreen(null, ui.deviceModelReady, actions::consent, onTypeIt = { actions.show(HomeView.TYPE) })
                ui.view == HomeView.TYPE -> ReadForm(null, ReadCopy.NAME_OPTIONAL, ReadCopy.ADD, actions::typed)
                ui.view == HomeView.FIX && ui.fixItemId != null ->
                    ReadForm(ui.fixRead, ReadCopy.NAME, ReadCopy.SAVE, { actions.fixed(ui.fixItemId, it) })
                ui.view == HomeView.BOX -> PackScreen(
                    ui.box, actions::answer, onFix = actions::fix, onRemove = actions::remove, onQuantity = actions::quantity,
                    bottom = { OutlinedButton(onClick = { actions.show(HomeView.CAMERA) }, modifier = Modifier.fillMaxWidth()) { Text(Copy.ADD_ANOTHER) } },
                )
                chosen == null -> Text(Copy.CHOOSE_DESTINATION_FIRST, style = MaterialTheme.typography.bodyLarge)
                ui.consent == false && !ui.deviceModelReady ->
                    ConsentScreen(false, false, actions::consent, onTypeIt = { actions.show(HomeView.TYPE) })
                else -> camera()
            }
        }
        if (ui.view != HomeView.BOX && ui.consent != null) {
            OutlinedButton(onClick = { actions.show(HomeView.BOX) }, modifier = Modifier.fillMaxWidth()) { Text(Copy.seeTheBox(ui.box.items.size)) }
        }
    }
}

@Composable
private fun DestinationPicker(chosen: DestinationName?, all: List<DestinationName>, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text(chosen?.let { Copy.sendingTo(it.name) } ?: Copy.WHERE_TO) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (d in all) DropdownMenuItem(text = { Text(d.name) }, onClick = { open = false; onPick(d.code) })
        }
    }
}
