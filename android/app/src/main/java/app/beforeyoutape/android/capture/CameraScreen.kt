package app.beforeyoutape.android.capture

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Rect
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.beforeyoutape.android.ui.Copy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

enum class CameraAccess { UNKNOWN, GRANTED, DENIED }

/**
 * The camera with the hold zone drawn on it. "Check now" takes one picture and hands over only
 * the zone; "Add a photo" opens the system photo picker (no permission needed); "Type it" is
 * always there. [busy] holds "Check now" while a read runs.
 */
@Composable
fun CameraScreen(busy: Boolean, onCrop: (BitmapCrop) -> Unit, onFailed: () -> Unit, onTypeIt: () -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var access by remember {
        mutableStateOf(
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) CameraAccess.GRANTED
            else CameraAccess.UNKNOWN,
        )
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        access = if (ok) CameraAccess.GRANTED else CameraAccess.DENIED
    }
    LaunchedEffect(Unit) { if (access == CameraAccess.UNKNOWN) ask.launch(Manifest.permission.CAMERA) }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            val crop = withContext(Dispatchers.Default) {
                runCatching {
                    Upright.picked(PhotoDecode.upright(context.contentResolver, uri, CropLimits.MAX_SIDE), HOLD_ZONE_ASPECT_W, HOLD_ZONE_ASPECT_H, CropLimits.MAX_SIDE)
                }.getOrNull()
            }
            if (crop != null) onCrop(BitmapCrop(crop)) else onFailed()
        }
    }

    val controller = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.IMAGE_CAPTURE)
            cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
        }
    }
    val worker = remember { Executors.newSingleThreadExecutor { r -> Thread(r, "byt-capture") } }
    DisposableEffect(Unit) { onDispose { worker.shutdown() } }
    LaunchedEffect(access) { if (access == CameraAccess.GRANTED) controller.bindToLifecycle(owner) }
    var previewSize by remember { mutableStateOf(IntSize.Zero) }

    fun checkNow() {
        val size = previewSize
        if (size.width == 0 || size.height == 0) return onFailed()
        val zone = holdZoneFor(size.width, size.height)
        controller.takePicture(worker, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val crop = runCatching {
                    val rotation = image.imageInfo.rotationDegrees
                    val rect = Rect(image.cropRect)
                    val buffer = try { image.toBitmap() } finally { image.close() }
                    Upright.zone(Upright.frame(buffer, rect, rotation), zone, CropLimits.MAX_SIDE)
                }.getOrNull()
                scope.launch { if (crop != null) onCrop(BitmapCrop(crop)) else onFailed() }
            }

            override fun onError(exception: ImageCaptureException) {
                scope.launch { onFailed() }
            }
        })
    }

    CameraContent(
        access = access,
        busy = busy,
        preview = {
            AndroidView(
                factory = { PreviewView(it).apply { this.controller = controller; scaleType = PreviewView.ScaleType.FILL_CENTER } },
                modifier = Modifier.fillMaxSize().onSizeChanged { previewSize = it },
            )
        },
        onCheckNow = ::checkNow,
        onPickPhoto = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        onTypeIt = onTypeIt,
    )
}

/** The camera screen's layout, without the camera, so it can be shown in tests. */
@Composable
fun CameraContent(access: CameraAccess, busy: Boolean, preview: @Composable () -> Unit, onCheckNow: () -> Unit, onPickPhoto: () -> Unit, onTypeIt: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (access == CameraAccess.GRANTED) {
            BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
                preview()
                // Drawn from holdZoneFor, the same fractions "Check now" cuts, so the frame and the cut agree.
                val zone = holdZoneFor(constraints.maxWidth, constraints.maxHeight)
                Box(
                    Modifier.offset(maxWidth * zone.x, maxHeight * zone.y).size(maxWidth * zone.w, maxHeight * zone.h)
                        .border(BorderStroke(3.dp, Color.White)).testTag("hold-zone").semantics { contentDescription = Copy.HOLD_ZONE },
                )
            }
            Button(onClick = { if (!busy) onCheckNow() }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(Copy.CHECK_NOW) }
        } else if (access == CameraAccess.DENIED) {
            Text(Copy.CAMERA_OFF, style = MaterialTheme.typography.bodyLarge)
        }
        OutlinedButton(onClick = onPickPhoto, modifier = Modifier.fillMaxWidth()) { Text(Copy.ADD_PHOTO) }
        OutlinedButton(onClick = onTypeIt, modifier = Modifier.fillMaxWidth()) { Text(Copy.TYPE_IT) }
    }
}
