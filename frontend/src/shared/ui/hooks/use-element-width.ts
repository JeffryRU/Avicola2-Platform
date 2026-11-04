import { useCallback, useState, type RefCallback } from 'react'

/** Ancho actual de un elemento (se actualiza al redimensionarlo). Devuelve 0 hasta medirlo. */
export function useElementWidth<T extends HTMLElement>(): [RefCallback<T>, number] {
  const [width, setWidth] = useState(0)
  const ref = useCallback<RefCallback<T>>((node) => {
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(node)
    setWidth(Math.round(node.getBoundingClientRect().width))
    // React 19: la función que devuelve un ref callback se llama al desmontar.
    return () => {
      observer.disconnect()
    }
  }, [])
  return [ref, width]
}
