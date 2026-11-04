import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/application/ports'
import { addDays, today } from '@/shared/domain/dates'
import type { ProjectionsGateway, SubmissionQueue } from '@/features/projections/application/ports'
import { PlanningService } from '@/features/projections/application/planning-service'
import { Catalog } from '@/features/catalog/domain/catalog'
import { newDraft } from '@/features/projections/domain/draft'
import type { Submission } from '@/features/projections/domain/schemas'

const catalog = new Catalog([{ id: 'B1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1.2, sort_order: 0 }])

class MemoryQueue implements SubmissionQueue {
  items: Submission[] = []
  list = () => this.items
  put = (s: Submission) => void (this.items = [...this.items.filter((x) => x.submission_id !== s.submission_id), s])
  remove = (id: string) => void (this.items = this.items.filter((x) => x.submission_id !== id))
  subscribe = () => () => {}
}

function service(submit: ProjectionsGateway['submit']) {
  const queue = new MemoryQueue()
  const gateway = { submit } as ProjectionsGateway
  let n = 0
  return { queue, planning: new PlanningService(gateway, queue, () => `id-${++n}`) }
}

const draft = { ...newDraft(today(), 'BRASA'), days: 1, step: 1 as const, units: { [today()]: { B1: 4 } } }
const ok = async (s: Submission) => ({ submission_id: s.submission_id, days: 1, total_units: 4, total_kg: 4.8 })

describe('envío de proyecciones con cola offline', () => {
  it('envía y vacía la cola', async () => {
    const { planning, queue } = service(ok)
    const out = await planning.submit(draft, catalog, 'ana')
    expect(out.sync).toBe('ok')
    expect(out.submission.days[0].units).toEqual({ B1: 4 })
    expect(queue.items).toEqual([])
  })

  it('sin conexión queda en cola y se reenvía después', async () => {
    let online = false
    const { planning, queue } = service(async (s) => {
      if (!online) throw new ApiError('No se pudo conectar con el servidor.', 0)
      return ok(s)
    })
    const out = await planning.submit(draft, catalog, 'ana')
    expect(out.sync).toBe('pending')
    expect(queue.items).toHaveLength(1)
    online = true
    expect(await planning.flush('ana')).toMatchObject({ sent: 1, pending: 0 })
  })

  it('si el servidor lo rechaza (422) no lo deja en cola', async () => {
    const { planning, queue } = service(async () => {
      throw new ApiError('El día ya pasó.', 422)
    })
    await expect(planning.submit(draft, catalog, 'ana')).rejects.toThrow('El día ya pasó.')
    expect(queue.items).toEqual([])
  })

  it('valida el borrador antes de enviar', async () => {
    const { planning } = service(ok)
    const empty = { ...draft, start: addDays(today(), 1), units: {} }
    await expect(planning.submit(empty, catalog, 'ana')).rejects.toThrow()
  })

  it('el supervisor envía por un vendedor y la cola es de quien envió', async () => {
    let online = false
    const sent: Submission[] = []
    const { planning } = service(async (s) => {
      if (!online) throw new ApiError('No se pudo conectar con el servidor.', 0)
      sent.push(s)
      return ok(s)
    })
    const out = await planning.submit(draft, catalog, 'ana', 'supervisor')
    expect(out.submission).toMatchObject({ seller: 'ana', author: 'supervisor' })
    online = true
    // La vendedora no reenvía lo que dejó el supervisor; el supervisor sí.
    expect(await planning.flush('ana')).toMatchObject({ sent: 0 })
    expect(await planning.flush('supervisor')).toMatchObject({ sent: 1, pending: 0 })
    expect(sent[0].seller).toBe('ana')
  })
})
