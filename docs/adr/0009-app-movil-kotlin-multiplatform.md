# ADR 0009 — App móvil con Kotlin Multiplatform, distribuida por GitHub Releases

- **Estado:** aceptado
- **Fecha:** 2026-11-06

## Contexto

- La app de vendedores es una PWA ([ADR 0004](0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md)). En el celular, el botón "Instalar" solo la agregaba como app web.
- Se quiere probar una **app móvil nativa** (Android e iOS) sin perder la web, que debe seguir funcionando en PC y celular (responsive).
- No hay cuenta de Play Store ni de Apple Developer: es una hackatón.
- Se espera crecer: subir Excel u otros archivos desde la web y desde la app.

## Decisión

### Web: se queda en React

- La web ya es responsive, offline y está probada. Reescribirla en Kotlin/Wasm costaría mucho y daría una web más pesada, dibujada en canvas, sin SEO y con menos accesibilidad.
- **Cliente HTTP: axios** detrás del mismo puerto `HttpClient`, en lugar de `fetch`:
  - `fetch` no informa el progreso de subida.
  - axios usa XMLHttpRequest, que sí lo informa en todos los navegadores (Safari de iPhone incluido).
  - Se agregó `upload(path, file, schema, { onProgress, signal, fields })` para las subidas de archivos.
  - El resto de la app no cambió: los gateways siguen usando el puerto.

### App móvil: módulo `mobile/` en el monorepo

- **Kotlin Multiplatform + Compose Multiplatform**: un solo código para Android e iOS, interfaz incluida.
- **Misma arquitectura hexagonal que la web:**
  - `domain`: modelos y reglas.
  - `application`: puertos, sesión, cola offline, actualizaciones.
  - `infrastructure`: Ktor, SSE, almacenamiento.
  - `ui`: pantallas y ViewModels.
  - `AppContainer` es la raíz de composición, como `container.ts`.
- **Paquetes:**

  | Necesidad | Elegido | Por qué |
  |---|---|---|
  | UI | Compose Multiplatform + Material 3 | Una sola UI para Android e iOS |
  | HTTP | Ktor Client (OkHttp en Android, Darwin en iOS) | Multiplataforma, SSE y progreso de subida (`onUpload`) incluidos |
  | JSON | kotlinx.serialization | Valida la forma de las respuestas, como zod en la web |
  | Fechas | kotlinx-datetime | "Hoy" en hora de Lima, igual que el backend |
  | Navegación | Navigation Compose (tipada) | Oficial y multiplataforma |
  | Estado | ViewModel + StateFlow | Oficial y multiplataforma |
  | Preferencias y cola offline | multiplatform-settings | SharedPreferences / NSUserDefaults sin código por plataforma |
  | Token | Android Keystore (AES-GCM) / Keychain | El token nunca queda en claro en el equipo |
  | Inyección de dependencias | Manual (`AppContainer`) | Igual que la web; Koin no hacía falta para este tamaño |

- **Responsive:** barra inferior en celular y riel lateral desde 600 dp (tablet, ventana grande). El contenido tiene un ancho máximo para no estirarse.

### Sesión de la app: token Bearer

- La app nativa no maneja bien la cookie HttpOnly. El backend agrega:
  - `POST /api/auth/token`: devuelve el token en el cuerpo.
  - Acepta `Authorization: Bearer <token>` en todas las rutas, incluido `/api/events`.
- **La web no cambia:** `/api/auth/login` sigue sin devolver el token y el navegador usa solo la cookie.
- **Sin riesgo de CSRF:** el encabezado `Authorization` no lo adjunta el navegador por su cuenta. La app no envía `Origin`, así que la protección CSRF actual no la bloquea.
- Con contraseña temporal, la app obliga a cambiarla. Después vuelve a pedir el token, porque el servidor invalida los anteriores.

### Distribución: GitHub Releases

- **Al crear un tag `v1.2.3`**, `mobile-release.yml`:
  - compila el APK firmado (`noraves.apk`) y un `.ipa` sin firmar;
  - los publica en una Release.
- **La web enlaza siempre la última versión:** `releases/latest/download/noraves.apk`, sin cambiar nada en cada versión.
- **El botón "Instalar" de la web:**

  | Equipo | Opciones |
  |---|---|
  | Android | App de Android (APK) o app web (PWA) |
  | iPhone | App web (Safari → Agregar a inicio) |
  | PC | App web |

- **La app avisa cuando hay una versión nueva:** consulta la API pública de GitHub, sin enviarle el token de la API.
- **iOS sin cuenta de Apple de pago** (99 USD/año):
  - Se compila y se prueba en el CI.
  - El `.ipa` sin firmar solo se puede instalar con Sideloadly o AltStore y un Apple ID gratuito. La app caduca a los 7 días.
  - Para los vendedores con iPhone, la opción recomendada sigue siendo la app web.

### CI

- `ci.yml`: backend (ruff + pytest) y frontend (lint + vitest + build).
- `mobile.yml`:
  - Android: pruebas JVM, APK debug y lint.
  - iOS: pruebas en el simulador y compilación de la app sin firma.
- La firma de Android usa Secrets del repositorio (`ANDROID_KEYSTORE_BASE64` y otros). La release falla con un mensaje claro si faltan.
  - Sin la clave, cada build quedaría firmado con otra clave y Android no dejaría actualizar sobre la versión anterior.

## Alternativas consideradas

- **Todo en Compose Multiplatform, también la web (Wasm):** una sola base de código, pero hay que reescribir la web y queda más pesada y menos accesible. Descartada por ahora.
- **Solo Android con Jetpack Compose:** más simple, pero sin iOS.
- **Retrofit / Moshi / Hilt:** estándar en Android, pero no corren en iOS.
- **ky en la web:** su progreso de subida depende de enviar el archivo por streaming, que no funciona en todos los navegadores.
- **Play Store / App Store:** requieren cuentas de pago y revisión. Se pueden sumar más adelante sin cambiar el código.
- **Firebase Cloud Messaging (push con la app cerrada):** queda para después. Requiere un proyecto de Firebase y credenciales. Hoy los avisos llegan por SSE con la app abierta.

## Consecuencias

- Las reglas viven en dos clientes (web y app). Cada uno las prueba por su lado, y los dos se apoyan en el backend, que es la fuente de verdad.
- **Antes de cada versión de la app**, hay que correr la prueba de contrato (`BackendContractTest`) contra un backend local o de pruebas.
- **La primera release necesita los Secrets de firma.** Perder la clave obliga a desinstalar y volver a instalar la app.
- **Distribuir por APK** implica que el vendedor permita "instalar apps de origen desconocido". La web lo explica antes de descargar.
