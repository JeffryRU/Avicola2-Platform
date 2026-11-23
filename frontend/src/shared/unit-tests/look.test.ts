import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOOK,
  PRESETS,
  luminance,
  lookFromStored,
  lookToStored,
  lookVars,
  primaryOptions,
  readablePrimary,
  sanitizeLook,
  type LookPreference,
} from '@/shared/domain/look'
import { fromStored, preferencesKey, toStored } from '@/shared/domain/preferences'
import { DEFAULT_A11Y } from '@/shared/domain/accessibility'
import { DEFAULT_APPEARANCE } from '@/shared/domain/appearance'

const custom: LookPreference = {
  ...DEFAULT_LOOK,
  theme: 'mio-abc',
  saved: [
    {
      ...PRESETS.campo,
      id: 'mio-abc',
      name: 'Mi naranja',
      menu: '#7a2e0e',
      primary: '#9a3412',
      pagePattern: 'icons',
      pageIcons: ['triangle', 'tractor', 'sparkle', 'hexagon'],
    },
  ],
  page: { show: false, size: 1.75 },
  menu: { show: true, size: 0.5 },
  primaries: { ciruela: '#1e3a8a' },
  open: { presets: false, mine: true },
  font: 'nunito',
}

describe('estilo en la cuenta', () => {
  it('ida y vuelta sin perder nada (temas propios, tamaños, colores y secciones)', () => {
    const stored = lookToStored(custom)
    expect(lookFromStored(JSON.parse(JSON.stringify(stored)) as Record<string, unknown>)).toEqual(custom)
  })

  it('cabe en lo que acepta el backend: un nivel, textos de hasta 40 y sí/no', () => {
    const stored = toStored({ appearance: DEFAULT_APPEARANCE, a11y: DEFAULT_A11Y, look: custom })
    expect(Object.keys(stored).length).toBeLessThanOrEqual(40)
    for (const group of Object.values(stored)) {
      if (typeof group === 'string') continue
      for (const v of Object.values(group)) {
        expect(typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40)).toBe(true)
      }
    }
  })

  it('una cuenta sin estilo no trae estilo (se queda el del equipo)', () => {
    expect(fromStored({ theme: 'light', contrast: 'system', accent: 'brand', a11y: {} }).look).toBeUndefined()
  })

  it('cambiar el estilo cambia la huella (se vuelve a guardar)', () => {
    const base = { appearance: DEFAULT_APPEARANCE, a11y: DEFAULT_A11Y, look: DEFAULT_LOOK }
    expect(preferencesKey(base)).not.toBe(preferencesKey({ ...base, look: custom }))
  })

  it('íconos: solo los del catálogo y hasta 4', () => {
    const look = sanitizeLook({
      saved: [{ id: 'x', pageIcons: ['egg', 'nada', 'egg', 'sun', 'star', 'moon', 'bird'] }],
    })
    expect(look.saved[0].pageIcons).toEqual(['egg', 'sun', 'star', 'moon'])
  })

  it('lo que no se entiende vuelve a su valor', () => {
    const look = sanitizeLook({ theme: 'nada', page: { size: 99 }, primaries: { marca: 'rojo' } })
    expect(look.theme).toBe('clasico') // el tema por defecto (MVP 1 y 2)
    expect(look.page.size).toBe(2)
    expect(look.primaries).toEqual({})
    expect(sanitizeLook({ font: 'comic' }).font).toBe('theme')
  })

  it('la letra elegida se aplica con cualquier tema; «la del tema» no pone nada', () => {
    expect(lookVars({ ...DEFAULT_LOOK, font: 'nunito' }, 'light')['--look-font']).toMatch(/^'Nunito'/)
    expect(lookVars(DEFAULT_LOOK, 'light')['--look-font']).toBeUndefined()
  })
})

describe('color principal', () => {
  it('siempre deja leer el texto blanco encima (4,5:1)', () => {
    for (const hex of ['#ffd54a', '#6fd3c1', '#ffffff', '#1557c0']) {
      expect(1.05 / (luminance(readablePrimary(hex)) + 0.05) >= 4.5).toBe(true)
    }
  })

  it('ofrece el del tema y tonos que combinan, sin repetir', () => {
    const options = primaryOptions(PRESETS.ciruela, '#1557c0')
    expect(options[0]).toMatchObject({ value: PRESETS.ciruela.primary, name: 'Del tema' })
    expect(new Set(options.map((o) => o.swatch)).size).toBe(options.length)
    expect(options.some((o) => o.name.startsWith('Morado'))).toBe(true)
  })

  it('el elegido para un tema manda sobre el del tema', () => {
    const vars = lookVars({ ...DEFAULT_LOOK, theme: 'ciruela', primaries: { ciruela: '#1e3a8a' } }, 'light')
    expect(vars['--look-primary']).toBe('#1e3a8a')
    // «Marca» usa el color de la marca (sin variable propia); el clásico trae su azul.
    expect(lookVars({ ...DEFAULT_LOOK, theme: 'marca' }, 'light')['--look-primary']).toBeUndefined()
    expect(lookVars(DEFAULT_LOOK, 'light')['--look-primary']).toBe('#1570ef')
    expect(lookVars(DEFAULT_LOOK, 'light')['--look-shape']).toBe('soft')
  })
})
