import { BarChart3, Calendar, Clock, Send, Tag } from 'lucide-react'
import { dFull, dShort, type IsoDate } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import type { Catalog } from '@/features/catalog'
import { sumUnits } from '@/shared/domain/products'
import type { Draft } from '@/features/projections/domain/draft'
import { DataTable } from '@/shared/ui/components/data-table'
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
import { SummaryRow } from '@/shared/ui/components/summary-row'

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
      <DataTable
        flush
        wrapperClassName="mt-2 mb-4"
        rows={dates}
        rowKey={(d) => d}
        columns={[
          { key: 'date', header: 'Fecha', cell: (d) => dShort(d) },
          { key: 'units', header: 'Unidades', numeric: true, cell: (d) => unitsCount(sumUnits(dayUnits(d))) },
          { key: 'kg', header: 'Kg (aprox.)', numeric: true, cell: (d) => kgAmount(catalog.kg(dayUnits(d))) },
        ]}
      />
      {kept > 0 && (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">
          Se mantienen {nf0(kept)} unidades que ya registraste de otros tamaños.
        </p>
      )}
      <div className="grid gap-2.5">
        <Button autoFocus className="h-12 text-md" onClick={onConfirm}>
          <Send /> Confirmar y enviar
        </Button>
        <Button variant="outline" className="h-12 text-md" onClick={onClose}>
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
          className="max-h-[88vh] overflow-y-auto rounded-t-lg border-t border-border px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] hc:border-t-heavy hc:border-foreground"
        >
          <SheetHeader className="px-0 pr-10">
            <SheetTitle className="text-xl font-semibold hc:font-extrabold">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold hc:font-extrabold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}
