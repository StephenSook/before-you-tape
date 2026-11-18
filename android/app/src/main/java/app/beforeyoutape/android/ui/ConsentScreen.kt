package app.beforeyoutape.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.beforeyoutape.android.ai.BlockReason

/**
 * Asked once, before any photo could leave the phone. [consent] null means not asked yet. With
 * consent declined and no model on the phone, nothing can read a label here, so typing is offered.
 */
@Composable
fun ConsentScreen(consent: Boolean?, deviceModelReady: Boolean, onChoice: (Boolean) -> Unit, onTypeIt: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            consent == null -> {
                Text(Copy.CONSENT, style = MaterialTheme.typography.bodyLarge)
                Button(onClick = { onChoice(true) }, modifier = Modifier.fillMaxWidth()) { Text(Copy.ALLOW) }
                OutlinedButton(onClick = { onChoice(false) }, modifier = Modifier.fillMaxWidth()) { Text(Copy.KEEP_ON_PHONE) }
            }
            !consent && !deviceModelReady -> {
                Text(Copy.blocked(BlockReason.NO_MODEL_NO_CONSENT), style = MaterialTheme.typography.bodyLarge)
                Button(onClick = onTypeIt, modifier = Modifier.fillMaxWidth()) { Text(Copy.TYPE_IT) }
            }
            !consent -> Text(Copy.KEPT_ON_PHONE, style = MaterialTheme.typography.bodyLarge)
        }
    }
}
