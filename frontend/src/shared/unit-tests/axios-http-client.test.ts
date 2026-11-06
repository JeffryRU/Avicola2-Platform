import { AxiosError, CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError } from '@/shared/application/ports'
import { AxiosHttpClient } from '@/shared/infrastructure/axios-http-client'

const okSchema = z.object({ ok: z.boolean() })

/** Red falsa: responde lo que se le indique y guarda la última petición. */
function fakeNetwork(status: number, data: unknown, onRequest?: (c: InternalAxiosRequestConfig) => void) {
  const calls: InternalAxiosRequestConfig[] = []
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config)
    onRequest?.(config)
    return { data, status, statusText: '', headers: {}, config }
  }
  return { adapter, calls }
}

function client(adapter: AxiosAdapter, onUnauthorized = vi.fn()) {
  return { http: new AxiosHttpClient({ baseUrl: '/api', timeoutMs: 1000, onUnauthorized, adapter }), onUnauthorized }
}

describe('AxiosHttpClient', () => {
  it('valida la respuesta con zod', async () => {
    const { adapter } = fakeNetwork(200, { ok: true })
    await expect(client(adapter).http.get('/x', okSchema)).resolves.toEqual({ ok: true })
  })

  it('rechaza una respuesta con otro formato', async () => {
    const { adapter } = fakeNetwork(200, { ok: 'sí' })
    await expect(client(adapter).http.get('/x', okSchema)).rejects.toThrow('formato esperado')
  })

  it('omite los parámetros sin valor y envía JSON', async () => {
    const { adapter, calls } = fakeNetwork(200, { ok: true })
    const { http } = client(adapter)
    await http.get('/x', okSchema, { a: 1, b: undefined })
    expect(calls[0].params).toEqual({ a: 1 })
    await http.post('/y', { n: 2 }, okSchema)
    expect(calls[1].method).toBe('post')
    expect(calls[1].data).toBe('{"n":2}')
  })

  it('traduce el detail de FastAPI y avisa del 401', async () => {
    const { adapter } = fakeNetwork(401, { detail: 'Inicia sesión para continuar.' })
    const { http, onUnauthorized } = client(adapter)
    const error = await http.get('/x', okSchema).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).message).toBe('Inicia sesión para continuar.')
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('traduce los errores de validación (422)', async () => {
    const { adapter } = fakeNetwork(422, { detail: [{ msg: 'campo requerido' }] })
    await expect(client(adapter).http.post('/x', {}, okSchema)).rejects.toThrow('Datos inválidos: campo requerido')
  })

  it('sin conexión o sin respuesta a tiempo devuelve status 0', async () => {
    const offline: AxiosAdapter = (config) => Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config))
    const timeout: AxiosAdapter = (config) => Promise.reject(new AxiosError('timeout', 'ECONNABORTED', config))
    await expect(client(offline).http.get('/x', okSchema)).rejects.toMatchObject({
      status: 0,
      message: 'No se pudo conectar con el servidor.',
    })
    await expect(client(timeout).http.get('/x', okSchema)).rejects.toMatchObject({
      status: 0,
      message: 'El servidor no respondió a tiempo.',
    })
  })

  it('204 sin cuerpo se valida como null', async () => {
    const { adapter } = fakeNetwork(204, '')
    await expect(client(adapter).http.post('/x', {}, z.null())).resolves.toBeNull()
  })

  it('sube un archivo como multipart e informa el progreso', async () => {
    const progress: number[] = []
    const file = new File(['a'.repeat(200)], 'pedidos.xlsx')
    const { adapter, calls } = fakeNetwork(200, { ok: true }, (config) => {
      config.onUploadProgress?.({ loaded: 50, total: 200, bytes: 50, lengthComputable: true })
      config.onUploadProgress?.({ loaded: 200, total: 200, bytes: 150, lengthComputable: true })
    })
    const result = await client(adapter).http.upload('/ingest/upload', file, okSchema, {
      onProgress: (p) => progress.push(p),
      fields: { tipo: 'pedidos' },
    })
    expect(result).toEqual({ ok: true })
    expect(progress).toEqual([25, 100])
    const form = calls[0].data as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('tipo')).toBe('pedidos')
    expect((form.get('file') as File).name).toBe('pedidos.xlsx')
    expect(calls[0].timeout).toBe(5 * 60_000)
  })

  it('una subida cancelada no se confunde con falta de conexión', async () => {
    const controller = new AbortController()
    const adapter: AxiosAdapter = (config) =>
      new Promise((_, reject) => {
        config.signal?.addEventListener?.('abort', () => reject(new CanceledError(undefined, undefined, config)))
      })
    const pending = client(adapter).http.upload('/x', new Blob(['x']), okSchema, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ status: 0, message: 'Se canceló el envío.' })
  })
})
