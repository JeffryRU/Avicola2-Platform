import { z } from 'zod'
import { collapseSpaces } from '@/shared/domain/format'

/** Formulario "Configuración de perfil" (mismas reglas que el backend). */
export const profileSchema = z.object({
  name: z
    .string()
    .transform(collapseSpaces)
    .pipe(z.string().min(1, 'Ingresa tu nombre.').max(100, 'Como máximo 100 caracteres.')),
})
