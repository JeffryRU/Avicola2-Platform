/** Grupos consecutivos del encabezado superior de una tabla (p. ej. las zonas sobre sus vendedores). */
export function headerGroups(groups: readonly (string | null)[]): { name: string | null; span: number }[] {
  const out: { name: string | null; span: number }[] = []
  for (const name of groups) {
    const last = out.at(-1)
    if (last?.name === name) last.span++
    else out.push({ name, span: 1 })
  }
  return out
}
