import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    // @Generable types: the Firebase AI KSP processor writes their schemas at compile time.
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
}

// google-services.json is never committed. Builds that have it (this Mac, the release
// build) process it; CI builds and tests without it.
if (file("google-services.json").exists()) {
    pluginManager.apply("com.google.gms.google-services")
    pluginManager.apply("com.google.firebase.crashlytics")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// Debug builds may carry an App Check debug token from the untracked local.properties. Each device
// has its own token: byt.appcheck.debugToken is the emulator's; -Pbyt.device=a16 reads
// byt.appcheck.debugToken.a16 instead. Release builds never carry one.
val debugDevice: String? = providers.gradleProperty("byt.device").orNull
val debugToken: String = localProps.getProperty(
    if (debugDevice == null) "byt.appcheck.debugToken" else "byt.appcheck.debugToken.$debugDevice",
    "",
)

// The rules bundle built from the web repo (android/build/embed, made by :engine:buildEmbed) and
// the bundled rules edition ship as app assets under engine/.
abstract class CopyEngineAssets : DefaultTask() {
    @get:InputDirectory
    abstract val embedDir: DirectoryProperty

    @get:InputFile
    abstract val edition: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = File(outputDir.get().asFile, "engine")
        out.mkdirs()
        for (name in listOf("byt-engine.js", "manifest.json")) File(embedDir.get().asFile, name).copyTo(File(out, name), overwrite = true)
        edition.get().asFile.copyTo(File(out, "edition.json"), overwrite = true)
    }
}

val copyEngineAssets = tasks.register<CopyEngineAssets>("copyEngineAssets") {
    dependsOn(":engine:buildEmbed")
    embedDir.set(rootProject.layout.buildDirectory.dir("embed"))
    edition.set(rootProject.layout.projectDirectory.file("../rules/edition.json"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyEngineAssets, CopyEngineAssets::outputDir)
    }
}

android {
    namespace = "app.beforeyoutape.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.beforeyoutape.android"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Tests that call the live Firebase project run only when asked for.
        testInstrumentationRunnerArguments["notAnnotation"] = "app.beforeyoutape.android.live.Live"
    }

    buildTypes {
        debug {
            resValue("string", "firebase_app_check_debug_token", debugToken)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
        resValues = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = false
        // Unit tests read the web repo's shared files (for example src/shared/cropLimits.ts).
        unitTests.all { it.systemProperty("byt.repoRoot", rootProject.projectDir.parentFile.absolutePath) }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":engine"))
    implementation(libs.zipline)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.ai)
    implementation(libs.firebase.ai.ondevice)
    implementation(libs.firebase.appcheck.playintegrity)
    implementation(libs.firebase.auth)
    implementation(libs.firebase.config)
    debugImplementation(libs.firebase.appcheck.debug)
    ksp(libs.firebase.ai.ksp.processor)
    implementation(libs.serialization.json)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)

    implementation(libs.coroutines.play.services)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)

    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
