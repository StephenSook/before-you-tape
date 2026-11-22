package app.beforeyoutape.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.beforeyoutape.android.box.BoxState

/**
 * The box: one card per item with the engine's verdict, the box-level lithium line and notes, and
 * the footer. With no engine result there is no verdict, only the line that says so. [savedBoxUnreadable]
 * is true while a saved box this phone could not open sits beside an empty one.
 */
@Composable
fun PackScreen(
    state: BoxState,
    onAnswer: (itemId: String, questionId: String, answerId: String) -> Unit,
    modifier: Modifier = Modifier,
    onFix: ((itemId: String) -> Unit)? = null,
    onRemove: ((itemId: String) -> Unit)? = null,
    onQuantity: ((itemId: String, step: Int) -> Unit)? = null,
    onConfirmNumber: ((itemId: String, field: String, value: Double) -> Unit)? = null,
    bottom: @Composable () -> Unit = {},
    savedBoxUnreadable: Boolean = false,
) {
    val result = state.result
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val line = PackLine.of(state, savedBoxUnreadable)
        when {
            line != null -> Text(line, style = MaterialTheme.typography.bodyLarge)
            result != null -> {
                for (item in state.items) {
                    val verdict = result.items[item.input.itemId] ?: continue
                    ItemCard(item, verdict, onAnswer, onFix, onRemove, onQuantity, onConfirmNumber)
                }
                if (result.lithium.text.isNotEmpty()) Text(result.lithium.text, style = MaterialTheme.typography.bodyLarge)
                for (note in result.notes) Text(note.text, style = MaterialTheme.typography.bodyMedium)
            }
        }
        bottom()
        Text(Copy.FOOTER, style = MaterialTheme.typography.bodySmall)
    }
}

/** The one line the box shows in place of verdicts, or null when it shows them. */
object PackLine {
    fun of(state: BoxState, savedBoxUnreadable: Boolean): String? = when {
        state.engineError != null -> Copy.RULES_NOT_LOADED
        // Empty only when the box is known to be: beside a save the phone could not open, it may hold items.
        state.items.isEmpty() -> if (savedBoxUnreadable) Copy.SAVED_BOX_UNREADABLE else Copy.NO_ITEMS
        else -> null
    }
}
