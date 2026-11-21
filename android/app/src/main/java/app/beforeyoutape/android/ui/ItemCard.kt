package app.beforeyoutape.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.beforeyoutape.android.box.BoxItem
import app.beforeyoutape.engine.ItemVerdict
import kotlinx.serialization.json.jsonPrimitive

/**
 * One item: its name, the engine's headline and first reason, where the read ran, and the one
 * question that would settle it. Every verdict word here is the engine's; the card writes none.
 */
@Composable
fun ItemCard(
    item: BoxItem,
    verdict: ItemVerdict,
    onAnswer: (itemId: String, questionId: String, answerId: String) -> Unit,
    onFix: ((itemId: String) -> Unit)? = null,
    onRemove: ((itemId: String) -> Unit)? = null,
    onQuantity: ((itemId: String, step: Int) -> Unit)? = null,
) {
    val input = item.input
    val name = input.overrides["itemName"]?.jsonPrimitive?.content ?: input.read.itemName
    Card(Modifier.fillMaxWidth().testTag("item-${input.itemId}")) {
        Column(Modifier.padding(16.dp)) {
            Text(if (input.quantity > 1) "$name x ${input.quantity.toString().removeSuffix(".0")}" else name,
                style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Text(verdict.headline, style = MaterialTheme.typography.titleLarge)
            // The first reason, unless it only restates the question asked below ("Is it new? Answer to finish this
            // check." beside "Is it new?"): the card asks its question once.
            verdict.hits.firstOrNull()?.takeUnless { h -> verdict.question?.let { h.text.startsWith(it.text) } == true }
                ?.let { Text(it.text, style = MaterialTheme.typography.bodyLarge) }
            Text(Copy.readLine(item.readSource, item.readMs), style = MaterialTheme.typography.bodyMedium)
            onQuantity?.let { set ->
                // Each tap sends a step, applied to the current quantity (1 to 99) in order.
                val n = input.quantity.toInt()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = { set(input.itemId, -1) }, enabled = n > 1, contentPadding = PaddingValues(0.dp),
                        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).semantics { contentDescription = Copy.ONE_FEWER }) { Text("-") }
                    Text(Copy.howMany(n), style = MaterialTheme.typography.bodyLarge)
                    OutlinedButton(onClick = { set(input.itemId, 1) }, enabled = n < 99, contentPadding = PaddingValues(0.dp),
                        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).semantics { contentDescription = Copy.ONE_MORE }) { Text("+") }
                }
            }
            if (onFix != null || onRemove != null) {
                Row {
                    onFix?.let { TextButton(onClick = { it(input.itemId) }) { Text(Copy.FIX_READING) } }
                    onRemove?.let { TextButton(onClick = { it(input.itemId) }) { Text(Copy.REMOVE) } }
                }
            }
            verdict.question?.let { q ->
                Spacer(Modifier.height(8.dp))
                Text(q.text, style = MaterialTheme.typography.bodyLarge)
                FlowRow {
                    for (a in q.answers) {
                        FilterChip(
                            selected = input.answers[q.id] == a.id,
                            onClick = { onAnswer(input.itemId, q.id, a.id) },
                            label = { Text(a.label) },
                            modifier = Modifier.padding(end = 8.dp),
                        )
                    }
                }
            }
        }
    }
}
