package app.beforeyoutape.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Shown instead of the app when this build is older than Remote Config's minimum_version_android. */
@Composable
fun UpdateScreen(onOpenDownloads: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(Copy.UPDATE_NEEDED, style = MaterialTheme.typography.titleMedium)
        Text(Copy.UPDATE_HOW, style = MaterialTheme.typography.bodyLarge)
        Button(onClick = onOpenDownloads, modifier = Modifier.fillMaxWidth()) { Text(Copy.OPEN_DOWNLOADS) }
    }
}
