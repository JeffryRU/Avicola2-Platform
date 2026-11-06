import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.android.kmp.library)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.compose.multiplatform)
}

// Constantes de compilación (URL de la API, versión, repositorio): una clase generada en
// commonMain, igual para Android e iOS.
val generateAppConfig by tasks.registering {
    val out = layout.buildDirectory.dir("generated/appconfig")
    val values = mapOf(
        "API_URL" to providers.gradleProperty("avicola.apiUrl"),
        "API_URL_DEV" to providers.gradleProperty("avicola.apiUrlDev"),
        "GITHUB_REPO" to providers.gradleProperty("avicola.githubRepo"),
        "VERSION_NAME" to providers.gradleProperty("avicola.versionName"),
    )
    inputs.properties(values.mapValues { it.value.get() })
    outputs.dir(out)
    doLast {
        val body = values.entries.joinToString("\n") { (k, v) -> "    const val $k: String = \"${v.get()}\"" }
        val file = out.get().file("pe/avicola2/app/BuildConfig.kt").asFile
        file.parentFile.mkdirs()
        file.writeText("package pe.avicola2.app\n\n/** Generado por Gradle (gradle.properties). */\nobject BuildConfig {\n$body\n}\n")
    }
}

kotlin {
    compilerOptions {
        optIn.addAll("kotlin.uuid.ExperimentalUuidApi", "kotlin.time.ExperimentalTime")
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }

    android {
        namespace = "pe.avicola2.app.shared"
        compileSdk = libs.versions.android.compileSdk.get().toInt()
        minSdk = libs.versions.android.minSdk.get().toInt()
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
    }

    // Solo para las pruebas: corre la lógica común en la JVM (sin emulador ni Mac).
    jvm()

    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    sourceSets {
        commonMain {
            kotlin.srcDir(generateAppConfig)
            dependencies {
                implementation(libs.compose.runtime)
                implementation(libs.compose.foundation)
                implementation(libs.compose.ui)
                implementation(libs.compose.material3)
                implementation(libs.compose.material3.windowsize)
                implementation(libs.compose.icons.core)
                implementation(libs.androidx.lifecycle.viewmodel.compose)
                implementation(libs.androidx.lifecycle.runtime.compose)
                implementation(libs.androidx.navigation.compose)
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.kotlinx.serialization.json)
                implementation(libs.kotlinx.datetime)
                implementation(libs.ktor.client.core)
                implementation(libs.ktor.client.content.negotiation)
                implementation(libs.ktor.serialization.kotlinx.json)
                implementation(libs.settings)
            }
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.ktor.client.mock)
            implementation(libs.settings.test)
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.okhttp)
            implementation(libs.kotlinx.coroutines.android)
            implementation(libs.androidx.activity.compose)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        jvmMain.dependencies {
            implementation(libs.ktor.client.java)
            implementation(libs.kotlinx.coroutines.swing)
        }
        // Capturas de pantalla en la JVM (Skia sin ventana), para revisar el diseño sin emulador.
        jvmTest.dependencies {
            implementation(libs.compose.desktop.linux)
        }
    }
}
