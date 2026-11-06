# App móvil (Android e iOS)

App de vendedores en **Kotlin Multiplatform + Compose Multiplatform**: un solo código para Android e iOS. Decisiones y paquetes: [ADR 0009](../docs/adr/0009-app-movil-kotlin-multiplatform.md).

## Qué hace

- **Login** con usuario y contraseña. El token se guarda cifrado (Keystore en Android, Keychain en iOS). Con contraseña temporal, obliga a cambiarla.
- **Inicio:**
  - Días abiertos y cerrados, con la hora de corte.
  - Qué días ya registraste y cuáles faltan.
  - "Pedir habilitación" para un día cerrado.
  - El supervisor ve quién del equipo registró hoy y el total en kg.
- **Registrar proyección:**
  1. Categoría y días (hasta 7); el supervisor elige además el vendedor.
  2. Cantidades por producto, con botones − / + o escribiendo el número.
  - "Sugerir cantidades" usa el pronóstico del servidor y "Copiar a todos los días" repite las del día abierto.
  - Si ya había algo registrado, se carga para editarlo.
- **Sin señal:** el envío queda en el celular y se manda solo al volver la conexión, sin duplicarse (el `submission_id` lo genera la app). Si el servidor lo rechaza, se puede reintentar o descartar.
- **Proyecciones:** las últimas dos semanas y la próxima. El supervisor puede filtrar por vendedor.
- **Avisos en tiempo real** (SSE), con contador de no leídos.
- **Perfil:** cambiar el nombre y la contraseña, ver el servidor y la versión, y buscar actualizaciones.
- **Responsive:** barra inferior en el celular y riel lateral en tablet. Tema claro u oscuro según el sistema.

## Estructura

```
mobile/
├── shared/                  ← todo el código común (lógica + pantallas)
│   └── src/
│       ├── commonMain/      domain · application · infrastructure · ui · App.kt · AppContainer.kt
│       ├── androidMain/     token en el Keystore, preferencias
│       ├── iosMain/         token en el Keychain, MainViewController
│       ├── commonTest/      pruebas de la lógica (corren en JVM e iOS)
│       └── jvmTest/         contrato con el backend real y capturas de pantalla
├── androidApp/              MainActivity, íconos, firma
└── iosApp/                  proyecto de Xcode (XcodeGen: project.yml)
```

## Requisitos

- JDK 17 o superior (el CI usa 21).
- Android SDK con la plataforma 37. Android Studio lo instala solo; por consola, crea `local.properties` con `sdk.dir=/ruta/al/sdk`.
- Para iOS: una Mac con Xcode y `brew install xcodegen`.

## Comandos

```bash
cd mobile
./gradlew :shared:jvmTest                 # pruebas de la lógica
./gradlew :androidApp:assembleDebug       # APK de prueba: androidApp/build/outputs/apk/debug/
./gradlew :androidApp:installDebug        # instala en un celular conectado por USB
./gradlew :shared:iosSimulatorArm64Test   # (Mac) pruebas en el simulador de iOS
cd iosApp && xcodegen && open iosApp.xcodeproj   # (Mac) abrir en Xcode
```

**Servidor:** por defecto, producción (`avicola.apiUrl` en `gradle.properties`). En el login, "Servidor" permite cambiar a Pruebas o escribir otra URL. En el emulador de Android, la PC es `http://10.0.2.2:8000/api`.

### Probar contra el backend local

Corren solo si defines las variables; en el CI se omiten.

```bash
# Terminal 1: backend con SQLite y usuarios de prueba (contraseña demo1234)
cd backend
export DATABASE_URL=sqlite:///./demo.db APP_ENV=local AUTH_SECRET=una-clave-local-larga-de-pruebas
uv run alembic upgrade head
uv run python -m app.planning.infrastructure.cli init
uv run python -m app.planning.infrastructure.cli seed
uv run uvicorn app.main:app --port 8000

# Terminal 2: contrato (login, registro, SSE) y capturas de las pantallas reales
cd mobile
AVICOLA_E2E_URL=http://127.0.0.1:8000/api AVICOLA_SCREENSHOTS=build/screens ./gradlew :shared:jvmTest
```

Las capturas quedan en `mobile/build/screens/`. En Linux, Skia necesita `libgl1` y `libfontconfig1`.

## Publicar una versión

1. **Una sola vez: crear la clave de firma** y guardarla bien. Si se pierde, los usuarios tendrán que desinstalar y volver a instalar.
   ```bash
   keytool -genkeypair -keystore noraves.jks -alias noraves -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 noraves.jks > noraves.jks.b64      # en Mac: base64 -i noraves.jks -o noraves.jks.b64
   ```
2. **Agregarla como Secrets del repositorio** (GitHub → Settings → Secrets and variables → Actions):

   | Secret | Valor |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | el contenido de `noraves.jks.b64` |
   | `ANDROID_KEYSTORE_PASSWORD` | la contraseña del keystore |
   | `ANDROID_KEY_ALIAS` | `noraves` |
   | `ANDROID_KEY_PASSWORD` | la contraseña de la clave |

   Con `gh`: `gh secret set ANDROID_KEYSTORE_BASE64 < noraves.jks.b64` (y lo mismo con los demás).
3. **Crear el tag:**
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```
   También se puede lanzar a mano: Actions → *Mobile release* → *Run workflow*.

El workflow `mobile-release.yml` publica una Release con:
- **`noraves.apk`:** firmado. Lo enlaza el botón "Instalar" de la web en Android: `https://github.com/JeffryRU/Avicola2-Platform/releases/latest/download/noraves.apk`.
- **`noraves-ios-sin-firmar.ipa`:** ver la sección siguiente.

La app compara su versión con la última Release y ofrece actualizar.

## iPhone

Apple no permite instalar una app descargada sin firmarla con una cuenta de desarrollador (99 USD/año). Mientras no la haya:
- **Recomendado:** la app web (Safari → Compartir → Agregar a inicio), que ya funciona sin señal.
- **Para probar la app nativa:** instala el `.ipa` con [Sideloadly](https://sideloadly.io/) o AltStore y un Apple ID gratuito. Requiere conectar el iPhone a una PC, y la app caduca a los 7 días.
- **Con la cuenta de pago:** firmar en el CI y distribuir por TestFlight. El código no cambia.
