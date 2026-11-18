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
 * the footer. With no engine result there is no verdict, only the line that says so.
 */
@Composable
fun PackScreen(state: BoxState, onAnswer: (itemId: String, questionId: String, answerId: String) -> Unit, modifier: Modifier = Modifier) {
    val result = state.result
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        when {
            state.engineError != null -> Text(Copy.RULES_NOT_LOADED, style = MaterialTheme.typography.bodyLarge)
            state.items.isEmpty() -> Text(Copy.NO_ITEMS, style = MaterialTheme.typography.bodyLarge)
            result != null -> {
                for (item in state.items) {
                    val verdict = result.items[item.input.itemId] ?: continue
                    ItemCard(item, verdict, onAnswer)
                }
                if (result.lithium.text.isNotEmpty()) Text(result.lithium.text, style = MaterialTheme.typography.bodyLarge)
                for (note in result.notes) Text(note.text, style = MaterialTheme.typography.bodyMedium)
            }
        }
        Text(Copy.FOOTER, style = MaterialTheme.typography.bodySmall)
    }
}
