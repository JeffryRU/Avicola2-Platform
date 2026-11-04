import { z } from 'zod'

/** Fecha ISO (AAAA-MM-DD) validada al recibirla de la API o del almacenamiento local. */
export const isoDateSchema = z.iso.date({ message: 'Fecha inválida.' })
