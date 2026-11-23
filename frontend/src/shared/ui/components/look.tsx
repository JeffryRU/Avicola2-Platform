import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CHART_KEYS, LINE_KEYS, LINE_STYLES, lookVars, type LookPreference } from '@/shared/domain/look'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import { LookContext } from '@/shared/ui/hooks/use-look'

/**
 * Aplica el estilo elegido como variables `--look-*` en <html> y lo guarda con `persist` (junto con
 * las variables ya calculadas, que public/appearance-boot.js pone antes del primer pintado).
 */
export function LookProvider({
  initial,
  persist,
  children,
}: {
  initial: LookPreference
  persist: (p: LookPreference, vars: Record<string, string>) => void
  children: ReactNode
}) {
  const [preference, setPreference] = useState(initial)
  const { theme } = useAppearance().resolved
  const vars = useMemo(() => lookVars(preference, theme), [preference, theme])

  useEffect(() => {
    const style = document.documentElement.style
    for (const name of Array.from(style)) if (name.startsWith('--look-')) style.removeProperty(name)
    for (const [name, value] of Object.entries(vars)) style.setProperty(name, value)
    document.documentElement.dataset.primary = '--look-primary' in vars ? 'custom' : 'brand'
    document.documentElement.dataset.shape = vars['--look-shape'] ?? 'crisp'
  }, [vars])

  // Colores propios de los gráficos: en línea sobre <html>; en alto contraste mandan los del sistema.
  const { contrast } = useAppearance().resolved
  useEffect(() => {
    const style = document.documentElement.style
    for (const key of CHART_KEYS) {
      const color = preference.chart[key]
      if (color && contrast !== 'high') style.setProperty(`--${key}`, color)
      else style.removeProperty(`--${key}`)
    }
    for (const key of LINE_KEYS) {
      const dash = preference.chartDash[key]
      if (dash) style.setProperty(`--dash-${key}`, LINE_STYLES[dash])
      else style.removeProperty(`--dash-${key}`)
    }
  }, [preference.chart, preference.chartDash, contrast])

  useEffect(() => persist(preference, vars), [preference, vars, persist])

  const value = useMemo(() => ({ preference, setPreference }), [preference])
  return <LookContext.Provider value={value}>{children}</LookContext.Provider>
}
