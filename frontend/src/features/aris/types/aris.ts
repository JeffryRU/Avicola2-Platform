import { dFull } from '@/shared/domain/dates'
import { ARIS_MAX_MB, type ArisLoad, type ArisStatus } from '@/features/aris/domain/aris'

export const ARIS_UPLOAD_LABEL = 'Subir datos de ARIS'
export const ARIS_LATER_LABEL = 'Ahora no'
export const ARIS_UPLOADING = (percent: number) => (percent < 100 ? `Subiendo… ${percent} %` : 'Procesando el archivo…')
export const ARIS_TRAINING = 'Datos de ARIS cargados: el modelo se está reentrenando con ellos (unos minutos).'

/** El aviso: qué falta y por qué conviene subirlo (no es obligatorio). */
export function arisNoticeText(s: ArisStatus): { title: string; detail: string } {
  const detail =
    'Con el export de DESPACHO de ARIS el modelo aprende la venta real y sugiere mejor la proyección. ' +
    `No es obligatorio. Desde aquí, hasta ${ARIS_MAX_MB} MB (un día o una semana); ` +
    'el export completo, por la carpeta de Google Drive o por el bot de Telegram o de WhatsApp.'
  if (!s.last_dispatch) return { title: 'Todavía no hay datos de ARIS cargados', detail }
  const since = `Los datos de ARIS llegan hasta el ${dFull(s.last_dispatch)}`
  const missing = s.missing_days === 1 ? 'falta el día de ayer' : `faltan ${s.missing_days} días`
  return { title: `${since}: ${missing}.`, detail }
}

const KIND = {
  despacho: ['línea de despacho', 'líneas de despacho'],
  ventas: ['venta en tienda', 'ventas en tienda'],
} as const

/** Resumen de la carga para el aviso de éxito. */
export function arisLoadSummary(loads: ArisLoad[]): string {
  const parts = loads.map((l) => {
    const range =
      l.date_from && l.date_to
        ? l.date_from === l.date_to
          ? ` del ${dFull(l.date_from)}`
          : ` del ${dFull(l.date_from)} al ${dFull(l.date_to)}`
        : ''
    const skipped = l.skipped
      ? ` (${l.skipped} ${l.skipped === 1 ? 'fila no se pudo' : 'filas no se pudieron'} leer)`
      : ''
    return `${l.rows.toLocaleString('es-PE')} ${KIND[l.kind][l.rows === 1 ? 0 : 1]}${range}${skipped}`
  })
  const verb = loads.length === 1 && loads[0]?.rows === 1 ? 'Se cargó' : 'Se cargaron'
  return `${verb} ${parts.join(' y ')}.`
}

/** Qué filas no se pudieron usar y por qué (para corregir el archivo), o null si no hubo. */
export function arisIssuesText(loads: ArisLoad[]): string | null {
  const issues = loads.flatMap((l) => l.issues)
  return issues.length ? `Revisa en el archivo: ${issues.join(' · ')}` : null
}

/** El archivo no entra por la app: a dónde mandarlo. */
export const ARIS_TOO_BIG = (mb: number) =>
  `El archivo pesa ${mb.toFixed(1)} MB y desde la app se suben hasta ${ARIS_MAX_MB} MB. ` +
  'Exporta menos días o envíalo por Google Drive, Telegram o WhatsApp.'
