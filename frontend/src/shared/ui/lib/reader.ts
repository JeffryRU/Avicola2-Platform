/** Lector de pantalla (opción de accesibilidad): qué texto se lee de cada elemento. */

/** ¿El navegador puede leer en voz alta? (Web Speech API) */
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

/** Lo que el lector toma como «una cosa»: un control, una celda, un título o un párrafo. */
export const READABLE =
  'button, a, input, select, textarea, label, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="radio"], [role="tab"], [role="switch"], [role="option"], h1, h2, h3, h4, p, li, td, th, dt, dd, small, figcaption'
const MAX_CHARS = 400

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Texto que se lee de un elemento: su nombre accesible o su texto, y el estado si es un control. */
export function textToRead(target: Element): string {
  const el = target.closest(READABLE) ?? target
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const label = clean(el.labels?.[0]?.textContent) || clean(el.getAttribute('aria-label'))
    const value =
      el instanceof HTMLInputElement && el.type === 'password'
        ? el.value
          ? 'contraseña escrita'
          : ''
        : clean(el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent : el.value)
    return [label || clean(el.getAttribute('placeholder')), value].filter(Boolean).join(': ')
  }
  const name =
    clean(el.getAttribute('aria-label')) || clean((el as HTMLElement).innerText) || clean(el.getAttribute('title'))
  const checked = el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed')
  const state = checked === 'true' ? ', activado' : checked === 'false' ? ', desactivado' : ''
  return (name + state).slice(0, MAX_CHARS)
}
