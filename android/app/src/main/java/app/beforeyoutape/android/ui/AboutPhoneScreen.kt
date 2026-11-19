package app.beforeyoutape.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp

/** About this phone: what reads labels here, the cloud model, App Check, and the rules it runs. */
@Composable
fun AboutPhoneScreen(
    info: AboutInfo,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onTurnOffCloud: () -> Unit = {},
    onAskAgain: () -> Unit = {},
) {
    val uri = LocalUriHandler.current
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val rows = About.rows(info)
        Text(rows.first(), style = MaterialTheme.typography.titleMedium)
        rows.drop(1).forEach { Text(it, style = MaterialTheme.typography.bodyLarge) }
        // Consent can change here at any time: off at once, or asked again from the start.
        if (info.cloudConsent == true) OutlinedButton(onClick = onTurnOffCloud, modifier = Modifier.fillMaxWidth()) { Text(Copy.TURN_OFF_CLOUD) }
        else OutlinedButton(onClick = onAskAgain, modifier = Modifier.fillMaxWidth()) { Text(Copy.ASK_AGAIN) }
        TextButton(onClick = { uri.openUri(About.RULES_URL) }) { Text(Copy.RULES_ON_WEB) }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(Copy.BACK) }
    }
}
