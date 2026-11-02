import { useEffect, useState } from 'react'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Anima un número desde 0 (como los contadores del mockup). */
export function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(0)
  const reduced = reducedMotion()
  useEffect(() => {
    if (reduced) return
    let frame = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / durationMs)
      setValue(target * (1 - Math.pow(1 - k, 3)))
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs, reduced])
  return reduced ? target : value
}
