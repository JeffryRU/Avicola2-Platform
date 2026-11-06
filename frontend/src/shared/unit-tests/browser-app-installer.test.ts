import { describe, expect, it } from 'vitest'
import { BrowserAppInstaller, DEFAULT_ANDROID_APK_URL } from '@/shared/infrastructure/browser-app-installer'

/** Ventana mínima: solo lo que usa el instalador. */
function fakeWindow(userAgent: string, maxTouchPoints = 0) {
  return {
    navigator: { userAgent, maxTouchPoints },
    addEventListener: () => undefined,
    matchMedia: () => ({ matches: false, addEventListener: () => undefined }),
  } as unknown as Window
}

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36'

describe('BrowserAppInstaller', () => {
  it('en Android ofrece el APK de la última Release', () => {
    const installer = new BrowserAppInstaller(fakeWindow(ANDROID))
    expect(installer.platform()).toBe('android')
    expect(installer.nativeAppUrl()).toBe(DEFAULT_ANDROID_APK_URL)
    expect(DEFAULT_ANDROID_APK_URL).toMatch(/\/releases\/latest\/download\/.+\.apk$/)
  })

  it('en iPhone y en PC no hay app nativa', () => {
    expect(new BrowserAppInstaller(fakeWindow(IPHONE)).nativeAppUrl()).toBeNull()
    expect(new BrowserAppInstaller(fakeWindow(IPHONE)).state()).toBe('ios')
    expect(new BrowserAppInstaller(fakeWindow(DESKTOP)).platform()).toBe('other')
    expect(new BrowserAppInstaller(fakeWindow(DESKTOP)).nativeAppUrl()).toBeNull()
  })

  it('el iPad con modo escritorio se reconoce como iOS', () => {
    const ipad = new BrowserAppInstaller(fakeWindow('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5))
    expect(ipad.platform()).toBe('ios')
  })

  it('una URL vacía oculta la app nativa (VITE_ANDROID_APK_URL="")', () => {
    expect(new BrowserAppInstaller(fakeWindow(ANDROID), '').nativeAppUrl()).toBeNull()
    expect(new BrowserAppInstaller(fakeWindow(ANDROID), 'https://x/app.apk').nativeAppUrl()).toBe('https://x/app.apk')
  })
})
