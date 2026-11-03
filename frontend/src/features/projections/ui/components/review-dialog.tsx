import type { ReactNode } from 'react'
import { BarChart3, Calendar, Clock, Send, Tag } from 'lucide-react'
import { dFull, dShort, type IsoDate } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import type { Catalog } from '@/features/catalog/domain/catalog'
import { sumUnits } from '@/features/catalog/domain/catalog'
import type { Draft } from '@/features/projections/domain/draft'
import { tableCls } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/components/shadcn/sheet'
import { daysCount, kgAmount, unitsCount } from '@/shared/types/labels'

export function SummaryRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[24px_auto_minmax(0,1fr)] items-center gap-3 border-b border-muted py-[13px] last:border-0 [&>svg]:size-5">
      {icon}
      <span className="text-ink-2">{label}</span>
      <b className="min-w-0 text-right [overflow-wrap:anywhere] [&_small]:block [&_small]:font-medium [&_small]:text-muted-foreground">
        {children}
      </b>
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
  const dayUnits = (d: IsoDate) => catalog.pick(draft.units[d], draft)
  const units = dates.reduce((s, d) => s + sumUnits(dayUnits(d)), 0)
  const kg = dates.reduce((s, d) => s + catalog.kg(dayUnits(d)), 0)
  // Unidades ya registradas de otros tamaños: se reenvían tal cual con el día.
  const kept = dates.reduce((s, d) => s + sumUnits(catalog.others(draft.units[d], draft)), 0)
  const body = (
    <>
      <div className="grid">
        <SummaryRow icon={<Calendar />} label="Fecha de inicio">
          {dFull(draft.start)}
        </SummaryRow>
        <SummaryRow icon={<Clock />} label="Días de proyección">
          {daysCount(draft.days)}
        </SummaryRow>
        <SummaryRow icon={<Tag />} label="Categoría">
          {catalog.detailedLabel(draft)}
        </SummaryRow>
        <SummaryRow icon={<BarChart3 />} label="Total proyectado">
          {nf0(units)} unidades<small>{kgAmount(kg, true)}</small>
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
              <td className={tableCls.td}>{unitsCount(sumUnits(dayUnits(d)))}</td>
              <td className={tableCls.td}>{kgAmount(catalog.kg(dayUnits(d)))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {kept > 0 && (
        <p className="-mt-2 mb-[18px] text-[13px] text-muted-foreground">
          Se mantienen {nf0(kept)} unidades que ya registraste de otros tamaños.
        </p>
      )}
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
