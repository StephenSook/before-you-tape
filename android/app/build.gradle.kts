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
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":engine"))
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.ai)
    implementation(libs.firebase.ai.ondevice)
    implementation(libs.firebase.appcheck.playintegrity)
    implementation(libs.firebase.auth)
    debugImplementation(libs.firebase.appcheck.debug)
    ksp(libs.firebase.ai.ksp.processor)
    implementation(libs.serialization.json)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
}
