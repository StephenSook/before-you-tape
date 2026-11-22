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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.beforeyoutape.android.box.BoxItem
import app.beforeyoutape.android.box.BoxLogic
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
    /** The Wh (or lithium grams) printed on the label, typed by the sender for an item whose read numbers are held. */
    onConfirmNumber: ((itemId: String, field: String, value: Double) -> Unit)? = null,
) {
    val input = item.input
    val name = input.overrides["itemName"]?.jsonPrimitive?.content ?: input.read.itemName
    Card(Modifier.fillMaxWidth().testTag("item-${input.itemId}")) {
        Column(Modifier.padding(16.dp)) {
            Text(if (input.quantity > 1) "$name x ${input.quantity.toString().removeSuffix(".0")}" else name,
                style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Text(verdict.headline, style = MaterialTheme.typography.titleLarge)
            // The first reason that does not only restate the question asked below ("Is it new? Answer to finish this
            // check." beside "Is it new?"): the card asks its question once. Same rule as the web card.
            verdict.hits.firstOrNull { h -> verdict.question?.let { h.text.startsWith(it.text) } != true }
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
            // Numbers read from a photo are held until the sender reads the label: an empty field, never a value
            // filled in for them. It asks again when the number it asks for changes.
            if (onConfirmNumber != null && verdict.hits.any { it.ruleId == ONE_READ_RULE }) {
                val field = BoxLogic.labelNumberField(BoxLogic.effectiveRead(input))
                key(field) { LabelNumberCheck(field) { value -> onConfirmNumber(input.itemId, field, value) } }
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

/** The rule that holds battery numbers read from one photo until the sender reads the label. */
private const val ONE_READ_RULE = "USPS-INTL-LI-ONE-READ"

/**
 * The label check: an empty field for the Wh printed on the label (the lithium grams on a lithium metal cell with no
 * Wh), and a button that is on only for a number above 0. The field empties again once a number is checked.
 */
@Composable
private fun LabelNumberCheck(field: String, onCheck: (Double) -> Unit) {
    var text by remember { mutableStateOf("") }
    val value = BoxLogic.labelNumberValue(text)
    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        text, { text = it }, label = { Text(if (field == "wattHours") Copy.TYPE_LABEL_WH else Copy.TYPE_LABEL_GRAMS) },
        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
    )
    Button(onClick = { value?.let { onCheck(it); text = "" } }, enabled = value != null) { Text(Copy.CHECK_THE_NUMBER) }
}
