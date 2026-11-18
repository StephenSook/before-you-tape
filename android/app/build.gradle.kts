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

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
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
    ksp(libs.firebase.ai.ksp.processor)
    implementation(libs.serialization.json)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
}
