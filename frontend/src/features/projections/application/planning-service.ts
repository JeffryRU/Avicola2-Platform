import { ApiError } from '@/shared/application/ports'
import { today } from '@/shared/domain/dates'
import type { ProjectionsGateway, SubmissionQueue } from '@/features/projections/application/ports'
import { draftDates, submittableDraft, type Draft } from '@/features/projections/domain/draft'
import type { Catalog } from '@/features/catalog/domain/catalog'
import type { Submission, SubmissionResult } from '@/features/projections/domain/schemas'

export type SubmitOutcome =
  | { sync: 'ok'; submission: Submission; result: SubmissionResult }
  | { sync: 'pending'; submission: Submission; error: string }

/**
 * Envío de proyecciones con cola offline: se guarda primero en el dispositivo y luego se manda.
 * Si el servidor la rechaza (4xx) se descarta y se informa; si no hay conexión, queda en cola.
 */
export class PlanningService {
  private readonly gateway: ProjectionsGateway
  private readonly queue: SubmissionQueue
  private readonly newId: () => string

  constructor(gateway: ProjectionsGateway, queue: SubmissionQueue, newId: () => string) {
    this.gateway = gateway
    this.queue = queue
    this.newId = newId
  }

  /** `seller`: el vendedor de la proyección; `author`: quien la envía (el supervisor, por él). */
  async submit(draft: Draft, catalog: Catalog, seller: string, author = seller): Promise<SubmitOutcome> {
    const valid = submittableDraft(today()).parse(draft)
    const products = catalog.of(valid.category)
    const submission: Submission = {
      submission_id: this.newId(),
      seller,
      ...(author !== seller ? { author } : {}),
      category: valid.category,
      days: draftDates(valid).map((date) => ({
        date,
        units: Object.fromEntries(products.map((p) => [p.id, valid.units[date]?.[p.id] ?? 0])),
      })),
      created_at: new Date().toISOString(),
    }
    this.queue.put(submission)
    return this.send(submission)
  }

  /** Reintenta lo pendiente de quien tiene la sesión (lo suyo y lo que envió por otros). */
  async flush(seller: string): Promise<{ sent: number; pending: number; rejected: string[] }> {
    let sent = 0
    const rejected: string[] = []
    const mine = (q: Submission) => (q.author ?? q.seller) === seller
    for (const s of this.queue.list().filter(mine)) {
      try {
        const outcome = await this.send(s)
        if (outcome.sync === 'ok') sent++
      } catch (e) {
        rejected.push(e instanceof Error ? e.message : String(e))
      }
    }
    return { sent, pending: this.queue.list().filter(mine).length, rejected }
  }

  private async send(submission: Submission): Promise<SubmitOutcome> {
    try {
      const result = await this.gateway.submit(submission)
      this.queue.remove(submission.submission_id)
      return { sync: 'ok', submission, result }
    } catch (e) {
      if (e instanceof ApiError && e.isRejected && e.status !== 401) {
        this.queue.remove(submission.submission_id)
        throw e
      }
      const error = e instanceof Error ? e.message : 'Error desconocido.'
      this.queue.put({ ...submission, error })
      return { sync: 'pending', submission, error }
    }
  }
}
