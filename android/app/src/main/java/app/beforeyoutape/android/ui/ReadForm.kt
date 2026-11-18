package app.beforeyoutape.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire

/**
 * The item form, as the web form draws it: name, what it is, the words on the label, the four
 * numbers (empty means not printed; a negative number cannot be saved), the seven yes-or-no facts
 * and the box. Save waits for a category and valid numbers.
 */
@Composable
fun ReadForm(
    start: ItemReadWire?,
    nameLabel: String,
    saveLabel: String,
    onSave: (ReadDraft) -> Unit,
    modifier: Modifier = Modifier,
    startCategory: ItemCategoryWire? = null,
) {
    var draft by remember { mutableStateOf(ReadDrafts.of(start).let { if (startCategory != null) it.copy(category = startCategory) else it }) }
    var menu by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(draft.itemName, { draft = draft.copy(itemName = it) }, label = { Text(nameLabel) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Text(ReadCopy.CATEGORY, style = MaterialTheme.typography.titleSmall)
        Box {
            OutlinedButton(onClick = { menu = true }, modifier = Modifier.fillMaxWidth()) {
                Text(draft.category?.let { ReadCopy.CATEGORIES.getValue(it) } ?: ReadCopy.CHOOSE_ONE)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                for ((c, label) in ReadCopy.CATEGORIES) {
                    DropdownMenuItem(text = { Text(label) }, onClick = { draft = draft.copy(category = c); menu = false })
                }
            }
        }
        OutlinedTextField(draft.labelText, { draft = draft.copy(labelText = it) }, label = { Text(ReadCopy.LABEL_TEXT) }, modifier = Modifier.fillMaxWidth())
        for ((f, label) in ReadCopy.NUMBERS) {
            val text = draft.numbers[f].orEmpty()
            OutlinedTextField(
                text, { draft = draft.copy(numbers = draft.numbers + (f to it)) }, label = { Text(label) }, singleLine = true,
                isError = ReadDrafts.parseNumber(text) == null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
            )
        }
        for ((f, label) in ReadCopy.FLAGS) {
            val on = draft.flags[f] ?: false
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .toggleable(value = on, role = Role.Switch, onValueChange = { draft = draft.copy(flags = draft.flags + (f to it)) }),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(label, Modifier.weight(1f))
                Switch(checked = on, onCheckedChange = null)
            }
        }
        Text(ReadCopy.BOX, style = MaterialTheme.typography.titleSmall)
        for ((b, label) in ReadCopy.BOX_VALUES) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .selectable(selected = draft.retailBox == b, role = Role.RadioButton, onClick = { draft = draft.copy(retailBox = b) }),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(selected = draft.retailBox == b, onClick = null)
                Text(label, Modifier.padding(start = 8.dp))
            }
        }
        Button(onClick = { onSave(draft) }, enabled = draft.category != null && ReadDrafts.numbersValid(draft), modifier = Modifier.fillMaxWidth()) {
            Text(saveLabel)
        }
    }
}
