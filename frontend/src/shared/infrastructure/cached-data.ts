/** Cachés del service worker con respuestas de la API (ver runtimeCaching en vite.config.ts). */
export const API_CACHES = ['api-master-data']

/** Al cerrar sesión: que el siguiente usuario del dispositivo no vea datos del anterior. */
export async function clearCachedApiData() {
  if (!('caches' in globalThis)) return
  await Promise.all(API_CACHES.map((name) => caches.delete(name)))
}
