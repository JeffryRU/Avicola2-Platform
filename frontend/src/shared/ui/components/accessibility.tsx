import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { a11yAttributes, type A11yPreference } from '@/shared/domain/accessibility'
import { A11Y_READER_ON } from '@/shared/types/appearance'
import { AccessibilityContext } from '@/shared/ui/hooks/use-accessibility'
import { READABLE, textToRead } from '@/shared/ui/lib/reader'

/**
 * Lector: con la opción activa, lee en voz alta (Web Speech API, en español) lo que se toca y lo
 * que se enfoca con el teclado. No cambia lo que hace el clic. Escape lo calla.
 */
function useReader(on: boolean) {
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!on || !synth) return
    let keyboard = false
    let marked: Element | null = null
    let voice: SpeechSynthesisVoice | undefined
    // Se guarda la frase en curso: si el navegador la libera antes de tiempo, deja de hablar.
    let current: SpeechSynthesisUtterance | null = null
    let timer = 0
    let keepAlive = 0

    // Las voces llegan tarde (voiceschanged). Se prefiere una voz en español instalada en el equipo:
    // las voces en línea fallan sin conexión y a veces se cortan.
    const pickVoice = () => {
      const es = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'))
      voice =
        es.find((v) => v.localService && /es-(pe|mx|us|419)/i.test(v.lang)) ??
        es.find((v) => v.localService) ??
        es.find((v) => /es-(pe|mx|us|419)/i.test(v.lang)) ??
        es[0]
    }
    pickVoice()
    synth.addEventListener('voiceschanged', pickVoice)

    const unmark = () => {
      marked?.classList.remove('reading')
      marked = null
    }
    const speak = (text: string, el?: Element) => {
      if (!text) return
      window.clearTimeout(timer)
      synth.cancel()
      unmark()
      marked = el ?? null
      marked?.classList.add('reading')
      // Hablar justo después de cancel() a veces se ignora (Chrome): se deja pasar un instante.
      timer = window.setTimeout(() => {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = voice?.lang ?? 'es-ES'
        if (voice) u.voice = voice
        u.rate = 1
        u.onend = u.onerror = () => {
          if (current === u) {
            current = null
            unmark()
          }
        }
        current = u
        synth.resume()
        synth.speak(u)
      }, 60)
    }
    // Chrome pausa las frases largas a los ~15 s: un empujón periódico las mantiene.
    keepAlive = window.setInterval(() => {
      if (synth.speaking && !synth.paused) {
        synth.pause()
        synth.resume()
      }
    }, 10_000)

    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element) speak(textToRead(e.target), e.target.closest(READABLE) ?? e.target)
    }
    const onKey = (e: KeyboardEvent) => {
      keyboard = true
      if (e.key === 'Escape') {
        synth.cancel()
        unmark()
      }
    }
    const onPointer = () => (keyboard = false)
    const onFocus = (e: FocusEvent) => {
      if (keyboard && e.target instanceof Element) speak(textToRead(e.target), e.target)
    }
    speak(A11Y_READER_ON)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('focusin', onFocus, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('focusin', onFocus, true)
      synth.removeEventListener('voiceschanged', pickVoice)
      window.clearTimeout(timer)
      window.clearInterval(keepAlive)
      unmark()
      current = null
      synth.cancel()
    }
  }, [on])
}

/**
 * Opciones de accesibilidad: las aplica en <html> (data-text-size, data-motion…), guarda la
 * elección con `persist` y enciende el lector. El primer pintado ya lo resolvió
 * public/appearance-boot.js.
 */
export function AccessibilityProvider({
  initial,
  persist,
  children,
}: {
  initial: A11yPreference
  persist: (p: A11yPreference) => void
  children: ReactNode
}) {
  const [preference, setPreference] = useState(initial)
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(a11yAttributes(preference))) root.setAttribute(k, v)
    persist(preference)
  }, [preference, persist])
  useReader(preference.readAloud)
  const value = useMemo(() => ({ preference, setPreference }), [preference])
  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>
}
