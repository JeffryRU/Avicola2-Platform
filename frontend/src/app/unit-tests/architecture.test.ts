import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Fronteras entre features y capas (ADR 0008): se prueba la configuración real de ESLint con
 * código de ejemplo en archivos que existen (el lint con tipos necesita que estén en el proyecto).
 */
let eslint: ESLint

/** Reglas de import que fallan para ese código, como si estuviera en `file`. */
async function importErrors(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath: file })
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message)
}

beforeAll(() => {
  eslint = new ESLint()
})

describe('fronteras entre features', { timeout: 60_000 }, () => {
  it('otra feature solo se importa por su index.ts', async () => {
    const deep = await importErrors(
      'src/features/stock/ui/hooks.ts',
      "import { Catalog } from '@/features/catalog/domain/catalog'\nexport const c = Catalog",
    )
    expect(deep.join()).toContain('punto de entrada')
    const viaIndex = await importErrors(
      'src/features/stock/ui/hooks.ts',
      "import { useCatalog } from '@/features/catalog'\nexport const c = useCatalog",
    )
    expect(viaIndex).toEqual([])
  })

  it('una feature solo depende de las declaradas en FEATURE_DEPS (sin ciclos)', async () => {
    const errors = await importErrors(
      'src/features/catalog/ui/hooks.ts',
      "import { useStockView } from '@/features/stock'\nexport const s = useStockView",
    )
    expect(errors.join()).toContain('no depende de esa feature')
  })

  it('el dominio solo toma tipos de otra feature; lo que se ejecuta va a shared/', async () => {
    const file = 'src/features/projections/domain/aggregation.ts'
    const runtime = await importErrors(file, "import { Catalog } from '@/features/catalog'\nexport const c = Catalog")
    expect(runtime.join()).toContain('import type')
    const typeOnly = await importErrors(
      file,
      "import type { Catalog } from '@/features/catalog'\nexport type C = Catalog",
    )
    expect(typeOnly).toEqual([])
  })

  it('no se saltan las fronteras con rutas relativas', async () => {
    const errors = await importErrors(
      'src/features/stock/ui/hooks.ts',
      "import { Catalog } from '../../catalog/domain/catalog'\nexport const c = Catalog",
    )
    expect(errors.join()).toContain('alias @/')
    const dotDot = await importErrors(
      'src/features/stock/ui/hooks.ts',
      "import { Catalog } from './../../catalog/domain/catalog'\nexport const c = Catalog",
    )
    expect(dotDot.join()).toContain('alias @/')
    const aliasBack = await importErrors(
      'src/features/stock/ui/hooks.ts',
      "import { Catalog } from '@/features/stock/../catalog/domain/catalog'\nexport const c = Catalog",
    )
    expect(aliasBack.join()).toContain('alias @/')
  })

  it('una feature no se importa a sí misma por su index.ts', async () => {
    const errors = await importErrors(
      'src/features/stock/ui/hooks.ts',
      "import { STOCK_TITLE } from '@/features/stock'\nexport const t = STOCK_TITLE",
    )
    expect(errors.join()).toContain('propio index.ts')
  })

  it('tampoco con import() dinámico', async () => {
    const [result] = await eslint.lintText("export const load = () => import('@/features/catalog/domain/catalog')\n", {
      filePath: 'src/features/stock/ui/hooks.ts',
    })
    const messages = (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax')
    expect(messages.map((m) => m.message).join()).toContain('import()')
  })

  it('de app/ una feature solo usa el contenedor, las rutas y la instalación', async () => {
    const shell = await importErrors(
      'src/features/stock/ui/hooks.ts',
      "import { AppShell } from '@/app/AppShell'\nexport const a = AppShell",
    )
    expect(shell.join()).toContain('app/')
    const routes = await importErrors(
      'src/features/stock/ui/hooks.ts',
      "import { paths } from '@/app/routes'\nexport const p = paths",
    )
    expect(routes).toEqual([])
  })
})

describe('shared/', { timeout: 60_000 }, () => {
  it('no importa features ni app/', async () => {
    const feature = await importErrors(
      'src/shared/domain/format.ts',
      "import type { Catalog } from '@/features/catalog'\nexport type C = Catalog",
    )
    expect(feature.join()).toContain('shared/ no importa features')
    const app = await importErrors(
      'src/shared/ui/hooks/use-is-mobile.ts',
      "import { paths } from '@/app/routes'\nexport const p = paths",
    )
    expect(app.join()).toContain('shared/ no importa features')
    const relative = await importErrors(
      'src/shared/ui/components/feedback.tsx',
      "import { useCatalog } from '../../../features/catalog'\nexport const u = useCatalog",
    )
    expect(relative.join()).toContain('alias @/')
  })

  it('mantiene las capas: el dominio común no importa React', async () => {
    const errors = await importErrors(
      'src/shared/domain/format.ts',
      "import { useState } from 'react'\nexport const u = useState",
    )
    expect(errors.join()).toContain('TypeScript puro')
  })
})
