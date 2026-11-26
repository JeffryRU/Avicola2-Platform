import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/components/shadcn/button'
import { clock, secondsLeft } from '@/features/assistant/domain/assistant'
import { useLinkCode } from '@/features/assistant/ui/hooks'
import {
  LINK_CODE_LABEL,
  LINK_COPIED,
  LINK_COPY,
  LINK_COPY_FAILED,
  LINK_EXPIRED,
  LINK_FAILED,
  LINK_INTRO,
  LINK_RENEW,
  LINK_REQUEST,
  LINK_TITLE,
  linkInstructions,
  linkRemaining,
} from '@/features/assistant/types/assistant'

/** Pide el código de vinculación y lo muestra grande, con el tiempo que le queda. */
export function AssistantLink() {
  const link = useLinkCode()
  const [now, setNow] = useState(() => Date.now())
  const data = link.data

  useEffect(() => {
    if (!data) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [data])

  const left = data ? secondsLeft(data.expires_at, now) : 0
  const copy = async () => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.code)
      toast.success(LINK_COPIED)
    } catch {
      toast.error(LINK_COPY_FAILED)
    }
  }

  return (
    <section aria-labelledby="assistant-link-title" className="grid gap-3">
      <h3 id="assistant-link-title" className="text-sm font-bold">
        {LINK_TITLE}
      </h3>
      <p className="text-sm text-muted-foreground">{LINK_INTRO}</p>
      {data && left > 0 && (
        <div className="grid gap-2 rounded-md border border-border bg-muted p-3 text-center hc:border-foreground">
          <p className="text-xs text-muted-foreground">{LINK_CODE_LABEL}</p>
          <p className="font-mono text-3xl font-bold tracking-widest select-all">{data.code}</p>
          <p className="text-xs" role="timer">
            {linkRemaining(clock(left))}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={copy} className="justify-self-center">
            <Copy aria-hidden /> {LINK_COPY}
          </Button>
          <p className="text-sm">{linkInstructions(data.code)}</p>
        </div>
      )}
      {data && left === 0 && <p className="text-sm text-bad">{LINK_EXPIRED}</p>}
      {link.isError && <p className="text-sm text-bad">{LINK_FAILED}</p>}
      <Button type="button" onClick={() => link.mutate()} disabled={link.isPending} className="justify-self-start">
        {data ? LINK_RENEW : LINK_REQUEST}
      </Button>
    </section>
  )
}
