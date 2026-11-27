/** Escala de los ejes de los gráficos (TypeScript puro). */

/** Máximo del eje para `n` divisiones con paso entero «redondo» (1, 2, 5 × 10ⁿ): sin marcas como 2,5 → «3». */
export function niceMax(m: number, n: number) {
  const raw = Math.max(m, 1) / n
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = Math.max(1, ([1, 2, 5, 10].find((s) => raw <= s * p) ?? 10) * p)
  return step * n
}
