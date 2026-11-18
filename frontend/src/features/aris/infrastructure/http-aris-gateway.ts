import type { HttpClient, UploadOptions } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { ArisGateway } from '@/features/aris/application/ports'
import { arisLoadsSchema, arisStatusSchema } from '@/features/aris/domain/aris'

/** Un Excel de varios meses tarda en procesarse: se espera más que en otras subidas. */
const ARIS_UPLOAD_TIMEOUT_MS = 10 * 60_000

export class HttpArisGateway implements ArisGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  status = () => this.http.get(endpoints.aris.status, arisStatusSchema)

  upload = (file: File, options: Pick<UploadOptions, 'onProgress' | 'signal'> = {}) =>
    this.http.upload(endpoints.aris.import, file, arisLoadsSchema, { ...options, timeoutMs: ARIS_UPLOAD_TIMEOUT_MS })
}
