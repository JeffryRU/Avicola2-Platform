import { useState, type SyntheticEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { addDays, dShort, formatTime, hhmm, today, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { can, hasTeamView } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import type { Product } from '@/features/catalog/domain/schemas'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { dateOf } from '@/features/editing/domain/editing'
import {
  draftOf,
  draftTotals,
  editableDays,
  invalidKg,
  isEditableDay,
  kgOf,
  toEntries,
  type StockDay,
  type StockDraft,
} from '@/features/stock/domain/stock'
import {
  COLUMNS,
  DAY_LABEL,
  HISTORY_DAYS,
  INVALID_KG_LABEL,
  KG_HINT,
  NOT_REGISTERED_LABEL,
  READ_ONLY_DAY_LABEL,
  RECORDED_EMPTY,
  RECORDED_TITLE,
  REGISTERED_LABEL,
  SAVE_LABEL,
  SAVED_MESSAGE,
  STOCK_SUBTITLE_MANAGE,
  STOCK_SUBTITLE_VIEW,
  STOCK_TITLE,
  TODAY_LABEL,
  UPDATE_LABEL,
} from '@/features/stock/types/stock'
import { useRegisterStock, useStock } from '@/features/stock/ui/hooks'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section, tableCls } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { cn } from '@/shared/ui/lib/utils'

const kgText = (n: number) => `${nf1(n)} kg`

/** Stock de despacho: el jefe de despacho lo registra por día; el supervisor lo consulta. */
export function StockPage() {
  const session = useRequiredSession()
  const canManage = can(session, 'manage_stock')
  const { catalog } = useCatalog()
  const ref = today()
  const [day, setDay] = useState<IsoDate>(ref)
  const stock = useStock(addDays(ref, -(HISTORY_DAYS - 1)), ref)
  const days = stock.data ?? []
  const record = days.find((d) => d.date === day)
  const products = catalog?.products ?? []
  // Se puede elegir cualquier día editable y cualquier día con registro.
  const options = [...new Set([...editableDays(ref), ...days.map((d) => d.date)])].sort().reverse()
  const registered = new Set(days.map((d) => d.date))
  const editable = canManage && isEditableDay(day, ref)

  return (
    <div>
      <PageHeader
        title={STOCK_TITLE}
        subtitle={canManage ? STOCK_SUBTITLE_MANAGE : STOCK_SUBTITLE_VIEW}
        back={hasTeamView(session) ? '/' : null}
      />
      <PageBody className="grid gap-4">
        <div>
          <span id="stock-day" className="mb-1 ml-0.5 block text-[12.5px] font-bold text-ink-2">
            {DAY_LABEL}
          </span>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger
              aria-labelledby="stock-day"
              className="!h-11 min-w-[15rem] rounded-[10px] border-[1.5px] bg-white font-semibold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((d) => (
                <SelectItem key={d} value={d}>
                  {d === ref ? `${TODAY_LABEL} · ` : ''}
                  {dShort(d)}
                  {registered.has(d) ? ` · ${REGISTERED_LABEL}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Section title={`${STOCK_TITLE} del ${dShort(day)}`}>
          {stock.isPending || !catalog ? null : editable ? (
            <StockForm key={`${day}:${record?.recorded_at ?? ''}`} day={day} products={products} record={record} />
          ) : record ? (
            <>
              <StockTable products={products} record={record} />
              {canManage && (
                <p className="px-4 pb-4 text-[13px] text-muted-foreground dsk:px-5">{READ_ONLY_DAY_LABEL}</p>
              )}
            </>
          ) : (
            <EmptyState title={NOT_REGISTERED_LABEL} />
          )}
        </Section>

        <Section title={RECORDED_TITLE}>
          {stock.isPending ? null : days.length === 0 ? (
            <EmptyState title={RECORDED_EMPTY} />
          ) : (
            <div className="overflow-x-auto px-3 pt-3 pb-3.5">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>{COLUMNS.day}</th>
                    <th className={tableCls.th}>{COLUMNS.units}</th>
                    <th className={tableCls.th}>{COLUMNS.kg}</th>
                    <th className={tableCls.th}>{COLUMNS.who}</th>
                    <th className={tableCls.th}>{COLUMNS.when}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date} className={cn(tableCls.row, d.date === day && '[&>td]:bg-secondary/60')}>
                      <td className={tableCls.td}>
                        <button
                          type="button"
                          className="font-bold text-primary underline-offset-2 hover:underline"
                          onClick={() => setDay(d.date)}
                        >
                          {dShort(d.date)}
                        </button>
                      </td>
                      <td className={cn(tableCls.td, 'font-bold')}>{nf0(d.total_units)}</td>
                      <td className={tableCls.td}>{kgText(d.total_kg)}</td>
                      <td className={tableCls.td}>{d.recorded_by}</td>
                      <td className={tableCls.td}>
                        {dShort(dateOf(d.recorded_at))} · {formatTime(hhmm(d.recorded_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </PageBody>
    </div>
  )
}

function RecordedBy({ record }: { record: StockDay }) {
  return (
    <small className="text-muted-foreground">
      Registrado por <b className="text-foreground">{record.recorded_by}</b> el {dShort(dateOf(record.recorded_at))} a
      las {formatTime(hhmm(record.recorded_at))}
    </small>
  )
}

/** Vista de solo lectura del stock de un día. */
function StockTable({ products, record }: { products: Product[]; record: StockDay }) {
  const lines = new Map(record.lines.map((l) => [l.product_id, l]))
  return (
    <div className="px-3 pt-3 pb-3.5">
      <div className="overflow-x-auto">
        <table className={tableCls.table}>
          <thead>
            <tr>
              <th className={tableCls.th}>{COLUMNS.product}</th>
              <th className={tableCls.th}>{COLUMNS.units}</th>
              <th className={tableCls.th}>{COLUMNS.kg}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={tableCls.row}>
                <td className={tableCls.td}>{p.name}</td>
                <td className={cn(tableCls.td, 'font-bold')}>{nf0(lines.get(p.id)?.units ?? 0)}</td>
                <td className={tableCls.td}>{kgText(lines.get(p.id)?.kg ?? 0)}</td>
              </tr>
            ))}
            <tr className={tableCls.total}>
              <td>{COLUMNS.total}</td>
              <td className="text-center">{nf0(record.total_units)}</td>
              <td className="text-center">{kgText(record.total_kg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-1 pt-3">
        <RecordedBy record={record} />
      </div>
    </div>
  )
}

/** Formulario del jefe de despacho: unidades y kg por producto. */
function StockForm({ day, products, record }: { day: IsoDate; products: Product[]; record?: StockDay }) {
  const register = useRegisterStock()
  const [draft, setDraft] = useState<StockDraft>(() => draftOf(products, record))
  const [error, setError] = useState<string | null>(null)
  const totals = draftTotals(products, draft)
  const set = (id: string, field: 'units' | 'kg', value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { units: '', kg: '' }), [field]: value } }))

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (invalidKg(draft)) {
      setError(INVALID_KG_LABEL)
      return
    }
    setError(null)
    register.mutate(
      { day, lines: toEntries(products, draft) },
      { onSuccess: () => toast.success(SAVED_MESSAGE), onError: (err) => setError(err.message) },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="px-3 pt-3 pb-4">
      <div className="overflow-x-auto">
        <table className={tableCls.table}>
          <thead>
            <tr>
              <th className={tableCls.th}>{COLUMNS.product}</th>
              <th className={cn(tableCls.th, 'hidden dsk:table-cell')}>{COLUMNS.weight}</th>
              <th className={tableCls.th}>{COLUMNS.units}</th>
              <th className={tableCls.th}>{COLUMNS.kg}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td className={tableCls.td}>
                  <b className="block">{p.name}</b>
                  {p.subcategory && <small className="text-muted-foreground">{p.subcategory}</small>}
                </td>
                <td className={cn(tableCls.td, 'hidden text-muted-foreground dsk:table-cell')}>
                  {kgText(p.kg_per_unit)}
                </td>
                <td className={tableCls.td}>
                  <Input
                    inputMode="numeric"
                    aria-label={`${COLUMNS.units} de ${p.name}`}
                    placeholder="0"
                    value={draft[p.id]?.units ?? ''}
                    onChange={(e) => set(p.id, 'units', e.target.value.replace(/\D/g, '').slice(0, 7))}
                    className="mx-auto h-11 w-[4.5rem] text-center font-bold dsk:w-24"
                  />
                </td>
                <td className={tableCls.td}>
                  <Input
                    inputMode="decimal"
                    aria-label={`${COLUMNS.kg} de ${p.name}`}
                    placeholder={nf1(kgOf(p, { units: draft[p.id]?.units ?? '', kg: '' }))}
                    value={draft[p.id]?.kg ?? ''}
                    onChange={(e) => set(p.id, 'kg', e.target.value.replace(/[^\d.,]/g, '').slice(0, 11))}
                    className="mx-auto h-11 w-[5.5rem] text-center dsk:w-28"
                  />
                </td>
              </tr>
            ))}
            <tr className={tableCls.total}>
              <td>{COLUMNS.total}</td>
              <td className="hidden dsk:table-cell" />
              <td className="text-center">{nf0(totals.units)}</td>
              <td className="text-center">{kgText(totals.kg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-1 pt-3 text-[13px] text-muted-foreground">{KG_HINT}</p>
      {error && (
        <p role="alert" className="px-1 pt-2 text-[13px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 px-1 pt-3">
        <span className="min-w-0 flex-1">{record && <RecordedBy record={record} />}</span>
        <Button type="submit" disabled={register.isPending} className="h-11 font-bold">
          {register.isPending ? <Loader2 className="animate-spin" /> : <Save />} {record ? UPDATE_LABEL : SAVE_LABEL}
        </Button>
      </div>
    </form>
  )
}
