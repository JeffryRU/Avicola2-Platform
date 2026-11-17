import { useCallback, useState, type RefCallback } from 'react'

/** Ancho y alto reales de un elemento (se actualizan al cambiar su tamaño). */
export function useElementSize<T extends HTMLElement>(): [RefCallback<T>, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const ref = useCallback<RefCallback<T>>((node) => {
    if (!node) return
    const read = (w: number, h: number) => setSize({ width: Math.round(w), height: Math.round(h) })
    const observer = new ResizeObserver(([entry]) => read(entry.contentRect.width, entry.contentRect.height))
    observer.observe(node)
    const rect = node.getBoundingClientRect()
    read(rect.width, rect.height)
    // React 19: la función que devuelve un ref callback se llama al desmontar.
    return () => {
      observer.disconnect()
    }
  }, [])
  return [ref, size]
}
