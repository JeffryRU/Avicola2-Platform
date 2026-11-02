import { ApiError } from '@/core/application/ports'
import { today } from '@/core/domain/dates'
import type { PlanningGateway, SubmissionQueue } from '@/modules/planning/application/ports'
import { draftDates, submittableDraft, type Draft } from '@/modules/planning/domain/draft'
import type { Catalog } from '@/modules/planning/domain/catalog'
import type { Submission, SubmissionResult } from '@/modules/planning/domain/schemas'

export type SubmitOutcome =
  | { sync: 'ok'; submission: Submission; result: SubmissionResult }
  | { sync: 'pending'; submission: Submission; error: string }

/**
 * Envío de proyecciones con cola offline: se guarda primero en el dispositivo y luego se manda.
 * Si el servidor la rechaza (4xx) se descarta y se informa; si no hay conexión, queda en cola.
 */
export class PlanningService {
  private readonly gateway: PlanningGateway
  private readonly queue: SubmissionQueue
  private readonly newId: () => string

  constructor(gateway: PlanningGateway, queue: SubmissionQueue, newId: () => string) {
    this.gateway = gateway
    this.queue = queue
    this.newId = newId
  }

  async submit(draft: Draft, catalog: Catalog, seller: string): Promise<SubmitOutcome> {
    const valid = submittableDraft(today()).parse(draft)
    const products = catalog.of(valid.category)
    const submission: Submission = {
      submission_id: this.newId(),
      seller,
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

  /** Reintenta lo pendiente del vendedor con sesión (el token identifica al vendedor). */
  async flush(seller: string): Promise<{ sent: number; pending: number; rejected: string[] }> {
    let sent = 0
    const rejected: string[] = []
    for (const s of this.queue.list().filter((q) => q.seller === seller)) {
      try {
        const outcome = await this.send(s)
        if (outcome.sync === 'ok') sent++
      } catch (e) {
        rejected.push(e instanceof Error ? e.message : String(e))
      }
    }
    return { sent, pending: this.queue.list().filter((q) => q.seller === seller).length, rejected }
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
