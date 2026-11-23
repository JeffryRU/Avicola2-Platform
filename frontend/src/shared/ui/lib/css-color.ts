/** Convierte cualquier color CSS ya aplicado (variables, color-mix) a `#rrggbb`. */
export function resolveHex(css: string, fallback: string): string {
  try {
    const probe = document.createElement('div')
    probe.style.color = css
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return fallback
    ctx.fillStyle = computed
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return fallback
  }
}
