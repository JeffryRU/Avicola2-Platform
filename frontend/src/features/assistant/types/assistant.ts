/** Textos del asistente (ADR 0008: las pantallas los toman de aquí). */
export const ASSISTANT_LABEL = 'Asistente'
export const ASSISTANT_OPEN = 'Abrir el asistente'
export const ASSISTANT_CLOSE = 'Cerrar el asistente'
export const ASSISTANT_TITLE = 'Asistente de AviPlanner'
export const ASSISTANT_DESCRIPTION = 'Pregunta por tus datos y las reglas del registro. Solo ve lo que tú puedes ver.'
export const ASSISTANT_PLACEHOLDER = 'Escribe tu pregunta…'
export const ASSISTANT_SEND = 'Enviar'
export const ASSISTANT_THINKING = 'Buscando en AviPlanner…'
export const ASSISTANT_NEW = 'Nueva conversación'
export const ASSISTANT_SUGGESTIONS = 'Preguntas sugeridas'
export const ASSISTANT_START = 'Elige una pregunta o escribe la tuya.'
export const ASSISTANT_FAILED = 'No pude responder ahora. Intenta de nuevo en un momento.'
export const ASSISTANT_NOTE = 'Las respuestas salen de los datos de AviPlanner, pero revisa las cifras importantes.'
export const tooLong = (max: number) => `Como máximo ${max} caracteres.`

// Historial (ADR 0024)
export const ASSISTANT_TOOLBAR = 'Opciones del asistente'
export const ASSISTANT_HISTORY = 'Historial'
export const ASSISTANT_HISTORY_TITLE = 'Tus conversaciones'
export const ASSISTANT_HISTORY_EMPTY = 'Todavía no tienes conversaciones guardadas.'
export const ASSISTANT_HISTORY_FAILED = 'No pude cargar el historial.'
export const ASSISTANT_HISTORY_LOADING = 'Cargando…'
export const ASSISTANT_BACK = 'Volver a la conversación'
export const ASSISTANT_OPEN_FAILED = 'No pude abrir esa conversación.'
export const ASSISTANT_DELETE = 'Borrar conversación'
export const ASSISTANT_DELETE_TITLE = '¿Borrar esta conversación?'
export const ASSISTANT_DELETE_DESCRIPTION = 'Ya no aparecerá en tu historial.'
export const ASSISTANT_DELETE_FAILED = 'No pude borrar la conversación.'
export const ASSISTANT_UNTITLED = 'Conversación sin título'
export const channelName = (channel: 'app' | 'telegram' | 'whatsapp') =>
  ({ app: 'App', telegram: 'Telegram', whatsapp: 'WhatsApp' })[channel]

// Tiempo relativo
export const AGO_NOW = 'hace un momento'
export const AGO_YESTERDAY = 'ayer'
export const agoMinutes = (n: number) => `hace ${n} min`
export const agoHours = (n: number) => `hace ${n} h`
export const agoDays = (n: number) => `hace ${n} días`

// Tablas
export const TABLE_EXPAND = 'Ampliar'
export const TABLE_DOWNLOAD = 'Descargar Excel'
export const TABLE_DOWNLOADING = 'Descargando…'
export const TABLE_DOWNLOAD_FAILED = 'No pude descargar el Excel.'
export const TABLE_DEFAULT_FILE = 'tabla'
export const TABLE_ASK_GROUP = 'Preguntas sobre esta tabla'
export const TABLE_WHY = '¿Por qué salen estos números'
export const TABLE_RECOMMEND = '¿Qué recomiendas para otro día'
export const TABLE_DIALOG_DESCRIPTION = 'Tabla completa. Cierra con Esc.'
export const TABLE_UNTITLED = 'Tabla'

// Telegram y WhatsApp
export const LINK_OPEN = 'Usar en Telegram o WhatsApp'
export const LINK_TITLE = 'Usar el asistente en Telegram o WhatsApp'
export const LINK_REQUEST = 'Obtener código'
export const LINK_RENEW = 'Pedir otro código'
export const LINK_FAILED = 'No pude generar el código. Intenta de nuevo.'
export const LINK_COPY = 'Copiar código'
export const LINK_COPIED = 'Código copiado'
export const LINK_COPY_FAILED = 'No pude copiar el código.'
export const LINK_EXPIRED = 'El código venció. Pide otro.'
export const LINK_CODE_LABEL = 'Tu código de vinculación'
export const LINK_INTRO = 'Vincula tu cuenta una vez y el asistente te responde también por chat.'
export const linkInstructions = (code: string) =>
  `Envía «vincular ${code}» al bot de Telegram o al WhatsApp de la empresa.`
export const linkRemaining = (time: string) => `Vence en ${time}`
