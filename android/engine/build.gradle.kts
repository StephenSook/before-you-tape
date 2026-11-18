// The rules engine host: plain Kotlin on the JVM, so the shared vectors run in unit tests
// and in CI with no device. It holds no rule logic; the rules are the web app's own bundle.
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

val repoRoot: File = rootProject.projectDir.parentFile
val embedDir = rootProject.layout.buildDirectory.dir("embed")

// The web repo's own script bundles src/embed/bridge.ts and the engine into byt-engine.js plus
// its manifest. It calls the esbuild binary from the repo's node_modules (npm ci at the root).
val buildEmbed = tasks.register<Exec>("buildEmbed") {
    description = "Bundles the web app's rules engine bridge for the app."
    workingDir = repoRoot
    inputs.dir(File(repoRoot, "src/engine"))
    inputs.dir(File(repoRoot, "src/shared"))
    inputs.dir(File(repoRoot, "src/embed"))
    inputs.file(File(repoRoot, "scripts/build-embed.sh"))
    outputs.dir(embedDir)
    commandLine("sh", "scripts/build-embed.sh", embedDir.get().asFile.absolutePath)
}

dependencies {
    implementation(libs.serialization.json)
    testImplementation(libs.junit)
    testImplementation(libs.zipline)
}

tasks.test {
    dependsOn(buildEmbed)
    systemProperty("byt.repoRoot", repoRoot.absolutePath)
    systemProperty("byt.embedDir", embedDir.get().asFile.absolutePath)
}
