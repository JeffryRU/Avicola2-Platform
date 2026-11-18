import { useRef, useState } from 'react'
import { DatabaseZap, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import { can } from '@/shared/domain/session'
import { today } from '@/shared/domain/dates'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Note } from '@/shared/ui/components/feedback'
import { useRequiredSession } from '@/features/auth'
import { ARIS_ACCEPT, needsUpload, tooBig } from '@/features/aris/domain/aris'
import {
  ARIS_LATER_LABEL,
  ARIS_TOO_BIG,
  ARIS_TRAINING,
  ARIS_UPLOAD_LABEL,
  ARIS_UPLOADING,
  arisLoadSummary,
  arisNoticeText,
} from '@/features/aris/types/aris'
import { useArisStatus, useUploadAris } from '@/features/aris/ui/hooks'

/** Día en que se tocó «Ahora no»: el aviso vuelve al día siguiente (en este equipo). */
const SNOOZE_KEY = 'aris.snoozed'

/**
 * Aviso de datos de ARIS: aparece solo a quien puede subirlos y solo cuando faltan días.
 * No bloquea nada: se puede posponer hasta mañana.
 */
export function ArisNotice() {
  const session = useRequiredSession()
  const allowed = can(session, 'load_aris')
  const status = useArisStatus(allowed)
  const upload = useUploadAris()
  const { preferences } = useContainer()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState(0)
  const [snoozed, setSnoozed] = useState(() => preferences.get(SNOOZE_KEY, z.string()) === today())

  if (!allowed || !status.data) return null
  const s = status.data
  if (s.training_pending && !needsUpload(s)) {
    return (
      <Note tone="ok" icon={<RefreshCw aria-hidden />} className="mx-4 mt-3 dsk:mx-0 dsk:mt-0 dsk:mb-5">
        <span className="min-w-0 flex-1">{ARIS_TRAINING}</span>
      </Note>
    )
  }
  if (!needsUpload(s) || (snoozed && !upload.isPending)) return null

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (tooBig(file)) {
      toast.error(ARIS_TOO_BIG(file.size / 1024 / 1024), { duration: 10_000 })
      if (input.current) input.current.value = ''
      return
    }
    setProgress(0)
    try {
      const loads = await upload.mutateAsync({ file, onProgress: setProgress })
      toast.success(arisLoadSummary(loads), { description: ARIS_TRAINING, duration: 10_000 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el archivo.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  const later = () => {
    preferences.set(SNOOZE_KEY, today())
    setSnoozed(true)
  }
  const { title, detail } = arisNoticeText(s)
  return (
    <Note
      tone={s.level === 'warning' ? 'warn' : 'info'}
      icon={<DatabaseZap aria-hidden />}
      className="mx-4 mt-3 dsk:mx-0 dsk:mt-0 dsk:mb-5"
    >
      <div className="min-w-[14rem] flex-1">
        <b className="block">{title}</b>
        <span className="text-sm">{detail}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={ARIS_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
          <Upload aria-hidden />
          {upload.isPending ? ARIS_UPLOADING(progress) : ARIS_UPLOAD_LABEL}
        </Button>
        {!upload.isPending && (
          <Button size="sm" variant="ghost" onClick={later}>
            {ARIS_LATER_LABEL}
          </Button>
        )}
      </div>
    </Note>
  )
}
