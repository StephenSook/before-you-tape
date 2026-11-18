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
import app.beforeyoutape.android.ai.DeviceModelStatus

/**
 * Asked once, before any photo could leave the phone. [consent] null means not asked yet. With
 * consent declined and no model on the phone, nothing can read a label here, so typing is offered.
 */
@Composable
fun ConsentScreen(
    consent: Boolean?,
    deviceModel: DeviceModelStatus,
    onChoice: (Boolean) -> Unit,
    onTypeIt: () -> Unit,
    modifier: Modifier = Modifier,
    onGetModel: () -> Unit = {},
) {
    Column(modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            consent == null -> {
                Text(Copy.CONSENT, style = MaterialTheme.typography.bodyLarge)
                Button(onClick = { onChoice(true) }, modifier = Modifier.fillMaxWidth()) { Text(Copy.ALLOW) }
                OutlinedButton(onClick = { onChoice(false) }, modifier = Modifier.fillMaxWidth()) { Text(Copy.KEEP_ON_PHONE) }
            }
            // Declined, and the phone can get its own model: offer it, so labels can still be read here.
            !consent && deviceModel == DeviceModelStatus.DOWNLOADABLE -> {
                Text(Copy.MODEL_CAN_DOWNLOAD, style = MaterialTheme.typography.bodyLarge)
                Button(onClick = onGetModel, modifier = Modifier.fillMaxWidth()) { Text(Copy.GET_MODEL) }
                OutlinedButton(onClick = onTypeIt, modifier = Modifier.fillMaxWidth()) { Text(Copy.TYPE_IT) }
            }
            !consent && deviceModel == DeviceModelStatus.DOWNLOADING -> {
                Text(Copy.MODEL_DOWNLOADING, style = MaterialTheme.typography.bodyLarge)
                Button(onClick = onTypeIt, modifier = Modifier.fillMaxWidth()) { Text(Copy.TYPE_IT) }
            }
            !consent && deviceModel != DeviceModelStatus.AVAILABLE -> {
                Text(Copy.blocked(BlockReason.NO_MODEL_NO_CONSENT), style = MaterialTheme.typography.bodyLarge)
                Button(onClick = onTypeIt, modifier = Modifier.fillMaxWidth()) { Text(Copy.TYPE_IT) }
            }
            !consent -> Text(Copy.KEPT_ON_PHONE, style = MaterialTheme.typography.bodyLarge)
        }
    }
}
