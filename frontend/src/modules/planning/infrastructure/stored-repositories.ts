import { z } from 'zod'
import type { KeyValueStore } from '@/core/application/ports'
import type {
  DraftRepository,
  ReadNotificationsRepository,
  SubmissionQueue,
} from '@/modules/planning/application/ports'
import { draftSchema, type Draft } from '@/modules/planning/domain/draft'
import { submissionSchema, type Submission } from '@/modules/planning/domain/schemas'

const QUEUE_KEY = 'nv_queue'
const DRAFT_KEY = 'nv_draft'
const READ_KEY = 'nv_notif_read'

/** Cola en el dispositivo. `list()` devuelve la misma referencia mientras no cambie (React). */
export class StoredSubmissionQueue implements SubmissionQueue {
  private readonly store: KeyValueStore
  private readonly listeners = new Set<() => void>()
  private items: Submission[]
  constructor(store: KeyValueStore) {
    this.store = store
    this.items = store.get(QUEUE_KEY, z.array(submissionSchema)) ?? []
  }

  list = (): Submission[] => this.items

  put(submission: Submission) {
    this.write([...this.list().filter((s) => s.submission_id !== submission.submission_id), submission])
  }

  remove(submissionId: string) {
    this.write(this.list().filter((s) => s.submission_id !== submissionId))
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  private write(items: Submission[]) {
    this.items = items
    this.store.set(QUEUE_KEY, items)
    this.listeners.forEach((l) => l())
  }
}

export class StoredDraftRepository implements DraftRepository {
  private readonly store: KeyValueStore
  constructor(store: KeyValueStore) {
    this.store = store
  }

  load = (): Draft | null => this.store.get(DRAFT_KEY, draftSchema)
  save = (draft: Draft) => this.store.set(DRAFT_KEY, draft)
  clear = () => this.store.remove(DRAFT_KEY)
}

export class StoredReadNotifications implements ReadNotificationsRepository {
  private readonly store: KeyValueStore
  constructor(store: KeyValueStore) {
    this.store = store
  }

  load = () => this.store.get(READ_KEY, z.array(z.string())) ?? []
  save = (ids: string[]) => this.store.set(READ_KEY, ids)
}
