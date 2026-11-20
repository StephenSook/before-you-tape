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
} else {
    // Without it the app has no Firebase app, so no AI client: a release build must never ship like that.
    tasks.matching { it.name.matches(Regex("(assemble|bundle|package)Release")) }.configureEach {
        doFirst { throw GradleException("A release build needs app/google-services.json (the Firebase app configuration).") }
    }
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

// Release signing: a keystore outside the repo (byt.release.storeFile in local.properties, default
// ~/.byt-keys/byt-android-release.jks). Its password lives in the macOS Keychain; the release
// scripts read it into BYT_RELEASE_PASSWORD for one build that runs without the configuration
// cache, so the password is never written to a cache entry.
val releaseStore: String = localProps.getProperty("byt.release.storeFile", "${System.getProperty("user.home")}/.byt-keys/byt-android-release.jks")
val releaseAlias: String = localProps.getProperty("byt.release.keyAlias", "byt-android")
val releasePassword: String? = System.getenv("BYT_RELEASE_PASSWORD")?.takeIf { it.isNotEmpty() }
if (releasePassword != null) {
    check(!gradle.startParameter.isConfigurationCacheRequested) {
        "Release signing must run with --no-configuration-cache."
    }
}

// versionCode is the HEAD commit's time (epoch seconds), so every newer build installs as an update
// over an older one (android/check-version-code.sh checks the built APK). A shallow CI checkout still
// has its HEAD commit; with no git at all the build falls back to 1.
val headCommitTime: Int = providers.exec {
    commandLine("git", "log", "-1", "--format=%ct")
    isIgnoreExitValue = true
}.standardOutput.asText.get().trim().toIntOrNull() ?: 1

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

// The shared vectors (tests/vectors) ship as device-test assets under vectors/, so the device tests
// run the very files the web app and the JVM tests run.
abstract class CopyVectorAssets : DefaultTask() {
    @get:InputDirectory
    abstract val vectorsDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = File(outputDir.get().asFile, "vectors")
        out.mkdirs()
        vectorsDir.get().asFile.listFiles { f -> f.name.endsWith(".json") }!!.forEach { it.copyTo(File(out, it.name), overwrite = true) }
    }
}

val copyVectorAssets = tasks.register<CopyVectorAssets>("copyVectorAssets") {
    vectorsDir.set(rootProject.layout.projectDirectory.dir("../tests/vectors"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyEngineAssets, CopyEngineAssets::outputDir)
        variant.androidTest?.sources?.assets?.addGeneratedSourceDirectory(copyVectorAssets, CopyVectorAssets::outputDir)
    }
}

android {
    namespace = "app.beforeyoutape.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.beforeyoutape.android"
        minSdk = 26
        targetSdk = 37
        versionCode = headCommitTime
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Tests that call the live Firebase project run only when asked for.
        testInstrumentationRunnerArguments["notAnnotation"] = "app.beforeyoutape.android.live.Live"
    }

    signingConfigs {
        if (releasePassword != null) {
            create("release") {
                storeFile = file(releaseStore)
                keyAlias = releaseAlias
                storePassword = releasePassword
                keyPassword = releasePassword
            }
        }
    }

    buildTypes {
        debug {
            resValue("string", "firebase_app_check_debug_token", debugToken)
        }
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    // -Pbyt.testBuildType=release runs the device tests against the release build (its App Check
    // provider and signing), for the release App Check probe; everything else tests debug.
    testBuildType = providers.gradleProperty("byt.testBuildType").orNull ?: "debug"

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

// The unit tests read these web repo files (the consent sentence, the item form's labels, the read
// prompt, the crop limits, the Remote Config template, the box document contract). Declared as
// inputs so a change there re-runs the tests instead of keeping an old result.
val webFilesUnitTestsRead = rootProject.projectDir.parentFile.let { root ->
    listOf(
        "src/shared", "src/ai/prompts.ts", "src/ui/ConsentNotice.tsx", "src/ui/ReadFields.tsx", "src/ui/categoryLabels.ts",
        "remoteconfig.template.json", "tests/contracts",
    ).map { File(root, it) }
}
tasks.withType<Test>().configureEach {
    inputs.files(webFilesUnitTestsRead).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("webFilesUnitTestsRead")
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
    implementation(libs.firebase.firestore)
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
