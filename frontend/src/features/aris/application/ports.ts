import type { UploadOptions } from '@/shared/application/ports'
import type { ArisLoad, ArisStatus } from '@/features/aris/domain/aris'

/** Datos de ARIS en la app: hasta qué día llegan y la carga de un export nuevo. */
export interface ArisGateway {
  status(): Promise<ArisStatus>
  upload(file: File, options?: Pick<UploadOptions, 'onProgress' | 'signal'>): Promise<ArisLoad[]>
}
