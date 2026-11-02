import type { ReactNode } from 'react'
import { BarChart3, Calendar, Clock, Send, Tag } from 'lucide-react'
import { dFull, dShort, type IsoDate } from '@/core/domain/dates'
import { nf0, nf1 } from '@/core/domain/format'
import type { Catalog } from '@/modules/planning/domain/catalog'
import { sumUnits } from '@/modules/planning/domain/catalog'
import type { Draft } from '@/modules/planning/domain/draft'
import { tableCls } from '@/ui/components/layout'
import { Button } from '@/ui/components/shadcn/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/components/shadcn/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/components/shadcn/sheet'

export function SummaryRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[24px_auto_minmax(0,1fr)] items-center gap-3 border-b border-muted py-[13px] last:border-0 [&>svg]:size-5">
      {icon}
      <span className="text-ink-2">{label}</span>
      <b className="min-w-0 text-right [overflow-wrap:anywhere] [&_small]:block [&_small]:font-medium [&_small]:text-muted-foreground">{children}</b>
    </div>
  )
}

interface Props {
  open: boolean
  mobile: boolean
  draft: Draft
  dates: IsoDate[]
  catalog: Catalog
  onClose: () => void
  onConfirm: () => void
}

/** Resumen antes de enviar: hoja inferior en celular, diálogo en escritorio. */
export function ReviewDialog({ open, mobile, draft, dates, catalog, onClose, onConfirm }: Props) {
  const units = dates.reduce((s, d) => s + sumUnits(draft.units[d]), 0)
  const kg = dates.reduce((s, d) => s + catalog.kg(draft.units[d] ?? {}), 0)
  const body = (
    <>
      <div className="grid">
        <SummaryRow icon={<Calendar />} label="Fecha de inicio">
          {dFull(draft.start)}
        </SummaryRow>
        <SummaryRow icon={<Clock />} label="Días de proyección">
          {draft.days} {draft.days === 1 ? 'día' : 'días'}
        </SummaryRow>
        <SummaryRow icon={<Tag />} label="Categoría">
          {draft.category}
        </SummaryRow>
        <SummaryRow icon={<BarChart3 />} label="Total proyectado">
          {nf0(units)} unidades<small>{nf1(kg)} kg (aprox.)</small>
        </SummaryRow>
      </div>
      <table
        className={`${tableCls.table} mt-2.5 mb-[18px] [&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right`}
      >
        <thead>
          <tr>
            <th className={tableCls.th}>Fecha</th>
            <th className={tableCls.th}>Unidades</th>
            <th className={tableCls.th}>Kg (aprox.)</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((d) => (
            <tr key={d}>
              <td className={tableCls.td}>{dShort(d)}</td>
              <td className={tableCls.td}>{nf0(sumUnits(draft.units[d]))} unid.</td>
              <td className={tableCls.td}>{nf1(catalog.kg(draft.units[d] ?? {}))} kg</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-2.5">
        <Button autoFocus className="h-[54px] rounded-[14px] text-[16.5px] font-bold" onClick={onConfirm}>
          <Send /> Confirmar y enviar
        </Button>
        <Button
          variant="outline"
          className="h-[54px] rounded-[14px] border-[1.5px] border-primary text-[16.5px] font-bold text-primary"
          onClick={onClose}
        >
          Seguir editando
        </Button>
      </div>
    </>
  )
  const title = 'Confirmar proyección'
  const description = 'Revisa el resumen antes de enviarlo a planificación.'
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="bottom"
          className="max-h-[88vh] overflow-y-auto rounded-t-3xl px-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="text-[22px] font-extrabold">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px] rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="text-[22px] font-extrabold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}
