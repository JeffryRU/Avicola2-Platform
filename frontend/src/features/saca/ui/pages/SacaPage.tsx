import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Bird, Info, PackageCheck, Scale, Users } from 'lucide-react'
import { useContainer } from '@/app/di'
import { addDays, dShort, today, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { missingSellers, sacaDays } from '@/features/saca/domain/saca'
import {
  COLUMNS,
  DAY_LABEL,
  FORMULA,
  KPI,
  NO_ORDERS_NOTE,
  NO_STOCK_NOTE,
  NOTHING_NOTE,
  SACA_SUBTITLE,
  SACA_TITLE,
  TODAY_LABEL,
  TOMORROW_LABEL,
  missingNote,
} from '@/features/saca/types/saca'
import { Note } from '@/shared/ui/components/feedback'
import { Kpi, PageBody, PageHeader, Section, tableCls } from '@/shared/ui/components/layout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { cn } from '@/shared/ui/lib/utils'

/** Supervisor: cuánto pedir a granja para un día, por producto, y con qué datos se calculó. */
export function SacaPage() {
  const { saca } = useContainer()
  const { catalog } = useCatalog()
  const ref = today()
  const [day, setDay] = useState<IsoDate>(addDays(ref, 1))
  const query = useQuery({ queryKey: ['saca', day], queryFn: () => saca.plan(day) })
  const plan = query.data
  const names = new Map((catalog?.products ?? []).map((p) => [p.id, p]))
  const dayLabel = (d: IsoDate) =>
    `${d === ref ? `${TODAY_LABEL} · ` : d === addDays(ref, 1) ? `${TOMORROW_LABEL} · ` : ''}${dShort(d)}`
  const missing = plan ? missingSellers(plan) : 0

  return (
    <div>
      <PageHeader title={SACA_TITLE} subtitle={SACA_SUBTITLE} />
      <PageBody className="grid gap-4">
        <div>
          <span id="saca-day" className="mb-1 ml-0.5 block text-[12.5px] font-bold text-ink-2">
            {DAY_LABEL}
          </span>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger
              aria-labelledby="saca-day"
              className="!h-11 min-w-[15rem] rounded-[10px] border-[1.5px] bg-white font-semibold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sacaDays(ref).map((d) => (
                <SelectItem key={d} value={d}>
                  {dayLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {query.isError && (
          <Note tone="bad" icon={<AlertCircle />}>
            <div>{query.error.message}</div>
          </Note>
        )}

        {plan && (
          <>
            <div className="grid grid-cols-2 gap-3 @3xl/main:grid-cols-4">
              <Kpi
                icon={<Bird />}
                tone="bg-secondary text-primary"
                label={KPI.request}
                value={nf0(plan.request)}
                index={0}
              />
              <Kpi
                icon={<Scale />}
                tone="bg-ok-soft text-ok"
                label={KPI.kg}
                value={`${nf1(plan.request_kg)} kg`}
                index={1}
              />
              <Kpi
                icon={<Scale />}
                tone="bg-warn-soft text-warn"
                label={KPI.live}
                value={`${nf1(plan.live_kg)} kg`}
                foot={`Rendimiento ${nf0(plan.yield_factor * 100)} %`}
                index={2}
              />
              <Kpi
                icon={<Users />}
                tone={missing ? 'bg-bad-soft text-destructive' : 'bg-ok-soft text-ok'}
                label={KPI.coverage}
                value={`${String(plan.sellers_registered)} de ${String(plan.sellers_total)}`}
                index={3}
              />
            </div>

            <div className="grid gap-2.5">
              {plan.sellers_registered === 0 ? (
                <Note tone="warn" icon={<AlertCircle />}>
                  <div>{NOTHING_NOTE}</div>
                </Note>
              ) : (
                missing > 0 && (
                  <Note tone="warn" icon={<AlertCircle />}>
                    <div>{missingNote(missing)}</div>
                  </Note>
                )
              )}
              {plan.stock_date ? (
                <Note tone="ok" icon={<PackageCheck />}>
                  <div>
                    Se descuenta el stock de despacho del <b>{dShort(plan.stock_date)}</b> ({nf0(plan.stock)} unid.).
                  </div>
                </Note>
              ) : (
                <Note tone="warn" icon={<PackageCheck />}>
                  <div>{NO_STOCK_NOTE}</div>
                </Note>
              )}
              {!plan.orders_available && (
                <Note icon={<Info />}>
                  <div>{NO_ORDERS_NOTE}</div>
                </Note>
              )}
            </div>

            <Section title={`Pedido a granja del ${dShort(plan.date)}`}>
              <div className="overflow-x-auto px-3 pt-3 pb-3.5">
                <table className={tableCls.table}>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>{COLUMNS.product}</th>
                      <th className={tableCls.th}>{COLUMNS.projected}</th>
                      {plan.orders_available && <th className={tableCls.th}>{COLUMNS.ordered}</th>}
                      {plan.orders_available && <th className={tableCls.th}>{COLUMNS.demand}</th>}
                      <th className={tableCls.th}>{COLUMNS.stock}</th>
                      <th className={tableCls.th}>{COLUMNS.request}</th>
                      <th className={tableCls.th}>{COLUMNS.kg}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.lines.map((l) => (
                      <tr key={l.product_id} className={tableCls.row}>
                        <td className={tableCls.td}>
                          <b className="block">{names.get(l.product_id)?.name ?? l.product_id}</b>
                          <small className="text-muted-foreground">{names.get(l.product_id)?.subcategory}</small>
                        </td>
                        <td className={tableCls.td}>{nf0(l.projected)}</td>
                        {plan.orders_available && <td className={tableCls.td}>{nf0(l.ordered)}</td>}
                        {plan.orders_available && <td className={tableCls.td}>{nf0(l.demand)}</td>}
                        <td className={cn(tableCls.td, l.stock > l.demand && 'text-warn')}>{nf0(l.stock)}</td>
                        <td className={cn(tableCls.td, 'text-[15.5px] font-extrabold text-primary')}>
                          {nf0(l.request)}
                        </td>
                        <td className={tableCls.td}>{nf1(l.request_kg)}</td>
                      </tr>
                    ))}
                    <tr className={tableCls.total}>
                      <td>{COLUMNS.total}</td>
                      <td className="text-center">{nf0(plan.projected)}</td>
                      {plan.orders_available && <td className="text-center">{nf0(plan.ordered)}</td>}
                      {plan.orders_available && <td className="text-center">{nf0(plan.demand)}</td>}
                      <td className="text-center">{nf0(plan.stock)}</td>
                      <td className="text-center">{nf0(plan.request)}</td>
                      <td className="text-center">{nf1(plan.request_kg)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="px-4 pb-4 text-[13px] text-muted-foreground dsk:px-5">{FORMULA}</p>
            </Section>
          </>
        )}
      </PageBody>
    </div>
  )
}
