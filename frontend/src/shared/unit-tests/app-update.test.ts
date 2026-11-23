import { describe, expect, it } from 'vitest'
import {
  CHECK_EVERY_MS,
  INITIAL_UPDATE,
  RETRY_EVERY_MS,
  delayFor,
  nextUpdate,
  readCheck,
} from '@/shared/domain/app-update'

const BUILD = 'abc-1'
const ok = (build: string) => readCheck(200, { build })
const down = readCheck(null, null)

describe('versión nueva y reinicios', () => {
  it('la misma versión no hace nada; otra, recarga', () => {
    expect(nextUpdate(INITIAL_UPDATE, ok(BUILD), BUILD)).toEqual(INITIAL_UPDATE)
    expect(nextUpdate(INITIAL_UPDATE, ok('abc-2'), BUILD).phase).toBe('updating')
  })

  it('un fallo puede ser la red: avisa del reinicio recién al segundo', () => {
    const once = nextUpdate(INITIAL_UPDATE, down, BUILD)
    expect(once.phase).toBe('idle')
    expect(delayFor(once)).toBe(RETRY_EVERY_MS)
    const twice = nextUpdate(once, down, BUILD)
    expect(twice.phase).toBe('restarting')
    // Vuelve con versión nueva (el despliegue terminó): recarga.
    expect(nextUpdate(twice, ok('abc-2'), BUILD).phase).toBe('updating')
    // Vuelve igual (solo se reinició): sigue normal.
    expect(nextUpdate(twice, ok(BUILD), BUILD)).toEqual(INITIAL_UPDATE)
    expect(delayFor(INITIAL_UPDATE)).toBe(CHECK_EVERY_MS)
  })

  it('502, 503 y 504 son «caído»; un 404 o un JSON raro no dicen nada', () => {
    for (const status of [502, 503, 504]) expect(readCheck(status, null).kind).toBe('down')
    expect(readCheck(404, null).kind).toBe('unknown')
    expect(readCheck(200, '<html>').kind).toBe('unknown')
    expect(readCheck(200, { build: '' }).kind).toBe('unknown')
    expect(nextUpdate(INITIAL_UPDATE, readCheck(404, null), BUILD)).toEqual(INITIAL_UPDATE)
  })

  it('ya recargando, nada lo detiene', () => {
    const updating = nextUpdate(INITIAL_UPDATE, ok('abc-2'), BUILD)
    expect(nextUpdate(updating, down, BUILD)).toBe(updating)
  })
})
