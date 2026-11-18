package app.beforeyoutape.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import app.beforeyoutape.android.capture.CameraScreen
import app.beforeyoutape.android.ui.HomeScreen
import app.beforeyoutape.android.ui.HomeView

class MainActivity : ComponentActivity() {
    private val vm: BoxViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface {
                    val ui by vm.ui.collectAsState()
                    HomeScreen(
                        ui, vm,
                        camera = { CameraScreen(busy = ui.busy, onCrop = vm::crop, onFailed = vm::photoFailed, onTypeIt = { vm.show(HomeView.TYPE) }) },
                        modifier = Modifier.safeDrawingPadding(),
                    )
                }
            }
        }
    }
}
