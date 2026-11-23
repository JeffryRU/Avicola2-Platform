import { rangeLabel } from '@/shared/domain/dates'
import { SyncStatus } from '@/shared/ui/components/sync-status'
import { bucketsOf, granularityOf } from '@/features/dashboards/domain/buckets'
import { GRANULARITY_NOTE, bucketLabels } from '@/features/dashboards/types/buckets'
import { periodAgg, useModelProjections } from '@/features/projections'
import { DashboardTabs } from '@/features/dashboards/ui/components/dashboard'
import { DataTable, type CellTone, type Column, type RowTone } from '@/shared/ui/components/data-table'
import { DashboardFilterBar } from '@/features/dashboards/ui/components/filter-bar'
import { kgPerUnitLabel, useCatalog } from '@/features/catalog'
import { usePeriodData, useDashboardFilters, useWideChart } from '@/features/dashboards/ui/hooks'
import { CountUp, LineChart, type LineSeriesId } from '@/shared/ui/components/charts'
import { EARLIER_DASH } from '@/shared/ui/lib/chart-dash'
import { useHistory } from '@/features/history'
import { onlyProducts, onlyProductsChanged, projectionParts, sheetRounds } from '@/features/dashboards/domain/sheets'
import { PART_COLOR, PREV_COLOR } from '@/shared/ui/lib/chart-dash'
import { FilterMenu } from '@/features/dashboards/ui/components/filter-bar'
import { CheckItem } from '@/features/dashboards/ui/components/product-detail'
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/shared/ui/components/shadcn/dropdown-menu'
import { bySubcategory } from '@/shared/domain/products'
import { toggleIn } from '@/shared/domain/format'
import { ChartLine, Columns2, Maximize2, Package, RectangleHorizontal, Scale } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { EmptyState } from '@/shared/ui/components/feedback'
import { ChartColorsButton, type ChartSeries } from '@/shared/ui/components/chart-colors'
import type { ChartKey } from '@/shared/domain/look'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/components/shadcn/dialog'
import { cn } from '@/shared/ui/lib/utils'
import { Kpi, KpiStrip, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { col, signTone } from '@/shared/ui/lib/table-columns'
import {
  DEFAULT_MEASURE,
  MEASURES,
  MEASURE_PARAM,
  bucketVersus,
  chartUnit,
  deviationPct,
  modelByDay,
  parseMeasure,
  productDeviation,
  unitsOf,
  versusDays,
  versusTotals,
  type Amount,
  type ProductDeviation,
  type Unit,
  type VersusPoint,
} from '@/features/dashboards/domain/versus'
import {
  ACCURACY_FOOT,
  ACCURACY_KPI,
  ALL_LINES_LABEL,
  ALL_PRODUCTS_LABEL,
  LINES_FILTER_LABEL,
  PARTS_LINE_LABEL,
  linesCount,
  BOTH_CHART_NOTE,
  CHART_EMPTY_BODY,
  CHART_EMPTY_TITLE,
  CHART_PRODUCTS_LABEL,
  EXPAND_LABEL,
  EXPAND_TITLE,
  WIDE_OFF_LABEL,
  WIDE_ON_LABEL,
  DEVIATION_KPI,
  DIFF_LABEL,
  DIFF_PCT_LABEL,
  DIFF_TIP,
  MEASURE_FILTER_LABEL,
  MEASURE_LABEL,
  MODEL_LABEL,
  MODEL_LEGEND,
  NO_PROJECTION_TIP,
  NO_REAL_BODY,
  NO_REAL_FOOT,
  NO_REAL_TIP,
  NO_REAL_TITLE,
  PRODUCTS_TITLE,
  PRODUCT_LABEL,
  PROJECTED_KPI,
  PROJECTION_LABEL,
  REAL_ERP_LABEL,
  REAL_LABEL,
  SERIES_COLUMN_LABEL,
  TOTAL_LABEL,
  UNIT_COLUMN,
  UNIT_SHORT,
  VERSUS_SUBTITLE,
  VERSUS_TITLE,
  amountText,
  amountsText,
  chartAria,
  chartTitle,
  daysWithRealFoot,
  inUnitFoot,
  measureSuffix,
  partsLegend,
  pctText,
  percentText,
  productNumber,
  productsCount,
  roundLabel,
  seriesNumber,
} from '@/features/dashboards/types/versus'

const tone = (v: number) => (v < 0 ? 'text-bad' : 'text-ok')

/** Una fila de la tabla bajo el gráfico: una serie con su valor de cada día. */
interface SeriesRow {
  key: string
  label: ReactNode
  /** Serie que dibuja en el gráfico (para resaltarla al pasar el mouse); la fila de diferencia, ninguna. */
  line?: LineSeriesId
  tone?: RowTone
  value: (p: VersusPoint) => Amount | null
  /** Texto de una medida en la celda (por defecto, la cifra). */
  text?: (p: VersusPoint, unit: Unit) => string
  cellTone?: (p: VersusPoint) => CellTone | false | undefined
}

/** Celda con una cifra por medida: la primera arriba y las demás, más tenues, debajo. */
function Stacked({ lines, tags }: { lines: string[]; tags?: string[] }) {
  const [first, ...rest] = lines
  // Con dos medidas, cada cifra lleva la suya al lado («unid.», «kg»): se sabe cuál es cuál.
  const tag = (i: number) =>
    tags && <span className="ml-1 inline-block w-8 text-left text-xs font-normal text-muted-foreground">{tags[i]}</span>
  return (
    <>
      <span className="whitespace-nowrap">
        {first}
        {tag(0)}
      </span>
      {rest.map((line, i) => (
        <small key={i} className="block text-xs whitespace-nowrap text-muted-foreground">
          {line}
          {tag(i + 1)}
        </small>
      ))}
    </>
  )
}

/**
 * Muestra de una serie: línea continua (proyección vigente), discontinua (pedido real) o, para
 * una ronda anterior (`round` 1, 2…), el trazo tenue de esa ronda. No depende solo del color.
 */
function SeriesKey({ dashed, round, model }: { dashed?: boolean; round?: number; model?: boolean }) {
  const prev = round !== undefined
  const color = model
    ? 'var(--chart-model)'
    : prev
      ? PREV_COLOR[(round - 1) % PREV_COLOR.length]
      : dashed
        ? 'var(--chart-2)'
        : 'var(--chart-1)'
  return (
    <svg aria-hidden width="28" height="12" viewBox="0 0 28 12" className="inline-block flex-none">
      <line
        x1="1"
        x2="27"
        y1="6"
        y2="6"
        strokeWidth={2.5}
        strokeLinecap="round"
        stroke={color}
        style={{
          strokeDasharray: model
            ? 'var(--dash-chart-model)'
            : prev
              ? EARLIER_DASH[(round - 1) % EARLIER_DASH.length]
              : dashed
                ? 'var(--dash-chart-2)'
                : 'var(--dash-chart-1)',
        }}
      />
      {/* El mismo marcador del gráfico: círculo (proyección; hueco si es anterior) o cuadrado (pedido). */}
      {model ? (
        <path d="M14 1.5 L18.5 6 L14 10.5 L9.5 6 Z" fill={color} stroke="var(--surface)" strokeWidth="1.25" />
      ) : dashed ? (
        <rect x="10.5" y="2.5" width="7" height="7" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
      ) : (
        <circle
          cx="14"
          cy="6"
          r="3.5"
          fill={prev ? 'var(--surface)' : color}
          stroke={prev ? color : 'var(--surface)'}
          strokeWidth="1.75"
        />
      )}
    </svg>
  )
}

/** Muestra de una franja apilada (un tamaño o producto de la proyección vigente). */
function PartKey({ index }: { index: number }) {
  const color = PART_COLOR[index % PART_COLOR.length]
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className="flex-none">
      <rect width="12" height="12" rx="2" fill={color} fillOpacity={0.45} stroke={color} />
    </svg>
  )
}

/** Cifra de un KPI con su medida al lado. */
function KpiAmount({ value, unit }: { value: number; unit: Unit }) {
  return (
    <>
      <CountUp value={value} />{' '}
      <span className="font-sans text-md font-normal text-muted-foreground">{UNIT_SHORT[unit]}</span>
    </>
  )
}

export function DashboardVersusPage() {
  const { period, sellers, measure, setMeasure } = useDashboardFilters()
  const [wide, setWide] = useWideChart()
  const units = unitsOf(measure)
  const main = units[0]
  const both = units.length > 1
  /** La medida extra (con «Unidades y kg»: los kg). */
  const other: Unit = main === 'units' ? 'kg' : 'units'
  const plotted = chartUnit(measure)
  const suffix = measureSuffix(units)
  const { catalog } = useCatalog()
  const data = usePeriodData(period)
  const source = data.data ?? { projections: [], sales: [] }

  const days = periodAgg(period.dates, sellers, source.projections, source.sales, catalog)
  // Productos del gráfico (vacía = el total de todos). Solo cambia la evolución semanal.
  const [picked, setPicked] = useState<string[]>([])
  // Líneas que se ven (filtro «Líneas») y la resaltada al pasar por su fila de la tabla.
  const [hiddenLines, setHiddenLines] = useState<LineSeriesId[]>([])
  const [focus, setFocus] = useState<LineSeriesId | null>(null)
  const showLine = (id: LineSeriesId) => !hiddenLines.includes(id)
  const chartProducts = catalog.forProjection().products
  const pickedNames = chartProducts.filter((p) => picked.includes(p.id)).map((p) => p.name)
  const chartDays = picked.length
    ? periodAgg(
        period.dates,
        sellers,
        onlyProducts(source.projections, picked),
        onlyProducts(source.sales, picked),
        catalog,
      )
    : days
  // Hojas de cada día (un vendedor puede volver a registrar 2 o 3 veces): una línea por ronda.
  const history = useHistory(period.from, period.to)
  const sheets = sheetRounds(
    period.dates,
    sellers,
    onlyProducts(source.projections, picked),
    onlyProductsChanged(history.data ?? [], picked),
    catalog,
  )
  const rounds = sheets.rounds
  const earlierRounds = Array.from({ length: rounds - 1 }, (_, i) => i + 1)
  const vs = versusTotals(days, catalog)
  // Sin pedidos del ERP no hay desviación ni exactitud que mostrar (0 % sería engañoso).
  const noReal = vs.daysWithReal === 0
  // De qué está hecha cada día la proyección vigente: franjas por tamaño (o por producto).
  const parts = projectionParts(period.dates, sellers, source.projections, chartProducts, picked)
  // Lo que el modelo habría sugerido cada día (mediana de los pedidos de ARIS de las 4 semanas
  // anteriores), con los mismos filtros de vendedor y productos.
  const model = useModelProjections(period.from, period.to)
  const modelDays = modelByDay(onlyProducts(model.data ?? [], picked), sellers, catalog)
  const hasModel = modelDays.size > 0
  // Todos los días del período (el gráfico ocupa la semana entera); sin dato, la línea se corta.
  // Un período largo se grafica por semana o por mes (un año día a día no se lee).
  const granularity = granularityOf(period.dates.length)
  const buckets = bucketsOf(period.dates, granularity)
  const allPoints = bucketVersus(versusDays(chartDays, catalog, sheets, parts, modelDays), buckets).map((p, i) => ({
    ...p,
    ...bucketLabels(buckets[i], granularity),
  }))
  // La tabla, solo con los días que tienen proyección.
  const points = allPoints.filter((p) => p.confirmed)
  type Point = (typeof points)[number]

  // Tabla bajo el gráfico: una fila por serie (rondas, modelo, pedido real) y una columna por día.
  const series = (
    key: string,
    line: LineSeriesId,
    label: ReactNode,
    value: (p: VersusPoint) => Amount | null,
    rowTone?: RowTone,
  ) => ({ key, line, label, value, tone: rowTone })
  const seriesRows: SeriesRow[] = [
    ...earlierRounds.map((r) =>
      series(
        `round-${String(r)}`,
        `e${r - 1}` as LineSeriesId,
        <>
          <SeriesKey round={r} />
          {roundLabel(r, rounds)} {suffix}
        </>,
        (p) => p.earlier[r - 1] ?? null,
        'muted',
      ),
    ),
    series(
      'projected',
      'a',
      <>
        <SeriesKey />
        {roundLabel(rounds, rounds)} {suffix}
      </>,
      (p) => p.projected,
    ),
    ...(hasModel
      ? [
          series(
            'model',
            'c',
            <>
              <SeriesKey model />
              {MODEL_LABEL} {suffix}
            </>,
            (p) => p.model,
          ),
        ]
      : []),
    series(
      'real',
      'b',
      <>
        <SeriesKey dashed />
        {REAL_LABEL} {suffix}
      </>,
      (p) => p.real,
    ),
    {
      key: 'diff',
      label: both ? `${DIFF_PCT_LABEL} ${suffix}` : DIFF_PCT_LABEL,
      tone: 'total',
      value: (p) => p.real,
      text: (p, u) => {
        const pct = p.real ? deviationPct(p.projected[u], p.real[u]) : null
        return pct == null ? '—' : pctText(pct)
      },
      cellTone: (p) => p.real != null && signTone(p.real[main] - p.projected[main]),
    },
  ]
  const seriesCell = (r: SeriesRow, p: Point) => {
    const v = r.value(p)
    if (v == null) return '—'
    return (
      <Stacked
        lines={units.map((u) => (r.text ? r.text(p, u) : seriesNumber(v[u])))}
        tags={both ? units.map((u) => UNIT_SHORT[u]) : undefined}
      />
    )
  }

  // Tabla por producto: todos los que se proyectan, en el orden del catálogo.
  const productRows = productDeviation(days, catalog)
  const hasData = (r: ProductDeviation) => r.projected.units > 0 || r.real.units > 0
  /** Columna de kg (un decimal) o de unidades (enteras). */
  const numberCol =
    (unit: Unit) =>
    (...args: Parameters<typeof col.kg<ProductDeviation>>) =>
      unit === 'kg' ? col.kg(...args) : col.units(...args)
  /** Una columna por medida: con una sola, el encabezado lleva la medida; con dos, van agrupadas. */
  const perUnit = (
    key: string,
    name: string,
    build: (unit: Unit, header: ReactNode, group: string | null) => Column<ProductDeviation>,
  ) =>
    units
      .map((u) =>
        both
          ? build(u, UNIT_COLUMN[u], name)
          : build(
              u,
              <>
                {name}
                <br />({UNIT_SHORT[u]})
              </>,
              null,
            ),
      )
      .map((c) => ({ ...c, key: `${key}-${c.key}` }))
  const productColumns: Column<ProductDeviation>[] = [
    {
      key: 'name',
      sticky: true,
      header: PRODUCT_LABEL,
      cell: ({ product: p }) => (
        <>
          <span className="block font-medium">{p.name}</span>
          <small className="block text-xs text-muted-foreground">{kgPerUnitLabel(p.kg_per_unit)}</small>
        </>
      ),
    },
    ...perUnit('projected', PROJECTION_LABEL, (u, header, group) =>
      numberCol(u)(u, header, (r) => r.projected[u], { group, total: productNumber(vs.projected[u], u) }),
    ),
    ...perUnit('real', REAL_LABEL, (u, header, group) =>
      numberCol(u)(u, header, (r) => r.real[u], { group, total: productNumber(vs.real[u], u) }),
    ),
    ...perUnit('diff', DIFF_LABEL, (u, header, group) =>
      numberCol(u)(u, header, (r) => r.diff[u], {
        group,
        faint: (r) => !hasData(r),
        tone: (r) => hasData(r) && signTone(r.diff[u]),
        total: productNumber(vs.diff[u], u),
        totalTone: signTone(vs.diff[u]),
      }),
    ),
    ...perUnit('pct', DIFF_PCT_LABEL, (u, header, group) =>
      col.change<ProductDeviation>(u, both ? header : DIFF_PCT_LABEL, (r) => r.pct[u], {
        group,
        className: 'font-medium',
        total: pctText(vs.deviationPct[u]),
        totalTone: signTone(vs.deviationPct[u]),
      }),
    ),
  ]

  const legend = (
    <>
      {/* Solo las líneas que se ven; al pasar el mouse por una, se resalta en el gráfico. */}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-ink-2">
        {[
          ...earlierRounds.map((r) => ({
            id: `e${r - 1}` as LineSeriesId,
            key: <SeriesKey round={r} />,
            name: roundLabel(r, rounds),
          })),
          { id: 'a' as const, key: <SeriesKey />, name: roundLabel(rounds, rounds) },
          ...(hasModel ? [{ id: 'c' as const, key: <SeriesKey model />, name: MODEL_LEGEND }] : []),
          { id: 'b' as const, key: <SeriesKey dashed />, name: REAL_ERP_LABEL },
        ]
          .filter((item) => showLine(item.id))
          .map((item) => (
            <span
              key={item.id}
              className="flex cursor-default items-center gap-1.5"
              onMouseEnter={() => setFocus(item.id)}
              onMouseLeave={() => setFocus(null)}
            >
              {item.key}
              {item.name}
            </span>
          ))}
      </div>
      {both && <p className="mb-2 text-right text-xs text-muted-foreground">{BOTH_CHART_NOTE}</p>}
      {GRANULARITY_NOTE[granularity] && (
        <p className="mb-2 text-right text-xs text-muted-foreground">{GRANULARITY_NOTE[granularity]}</p>
      )}
      {parts.names.length > 1 && points.length > 0 && showLine('parts') && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{partsLegend(picked.length > 0 && picked.length <= 4)}</span>
          {parts.names.map((name, k) => (
            <span key={name} className="flex items-center gap-1.5">
              <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className="flex-none">
                <rect
                  width="12"
                  height="12"
                  rx="2"
                  fill={PART_COLOR[k % PART_COLOR.length]}
                  fillOpacity={0.45}
                  stroke={PART_COLOR[k % PART_COLOR.length]}
                />
              </svg>
              {name}
            </span>
          ))}
        </div>
      )}
    </>
  )

  const chart = (
    <LineChart
      unitLabel={UNIT_SHORT[plotted]}
      show={showLine}
      focus={focus}
      label={chartAria(plotted)}
      empty={
        <>
          <b className="block font-semibold text-foreground">{CHART_EMPTY_TITLE}</b>
          <span className="text-sm text-muted-foreground">{CHART_EMPTY_BODY}</span>
        </>
      }
      points={allPoints.map((p) => ({
        key: p.date,
        label: p.label,
        sublabel: p.sublabel,
        a: p.confirmed ? p.projected[plotted] : null,
        b: p.real?.[plotted] ?? null,
        c: p.model?.[plotted] ?? null,
        earlier: p.confirmed ? p.earlier.map((e) => e[plotted]) : undefined,
        parts: p.confirmed && parts.names.length > 1 ? p.parts.map((x) => x[plotted]) : undefined,
        tip: (
          <>
            <b>{p.title}</b>
            {p.confirmed &&
              p.earlier.map((e, i) => (
                <span key={i}>
                  <br />
                  {roundLabel(i + 1, rounds)}: {amountsText(e, units)}
                </span>
              ))}
            <br />
            {p.confirmed ? `${roundLabel(rounds, rounds)}: ${amountsText(p.projected, units)}` : NO_PROJECTION_TIP}
            {p.confirmed &&
              parts.names.length > 1 &&
              parts.names.map((name, k) => (
                <span key={name}>
                  <br />
                  <span className="opacity-80">
                    · {name}: {amountsText(p.parts[k], units)}
                  </span>
                </span>
              ))}
            {p.model != null && (
              <>
                <br />
                {MODEL_LABEL}: {amountsText(p.model, units)}
              </>
            )}
            <br />
            {p.real == null ? (
              NO_REAL_TIP
            ) : (
              <>
                {REAL_LABEL}: {amountsText(p.real, units)}
                {p.confirmed && p.projected[main] > 0 && (
                  <>
                    <br />
                    {DIFF_TIP}:{' '}
                    {units
                      .map((u) => {
                        const pct = deviationPct(p.projected[u], p.real?.[u] ?? 0)
                        const text = pct == null ? '—' : pctText(pct)
                        return both ? `${text} ${UNIT_SHORT[u]}` : text
                      })
                      .join(' · ')}
                  </>
                )}
              </>
            )}
          </>
        ),
      }))}
    />
  )

  const seriesTable = points.length > 0 && (
    <div className="relative -mx-4 mt-3 -mb-4 overflow-x-auto dsk:-mx-5">
      <DataTable
        density="compact"
        rows={seriesRows.filter((r) => !r.line || showLine(r.line))}
        onRowHover={(r) => setFocus(r?.line && showLine(r.line) ? r.line : null)}
        rowKey={(r) => r.key}
        rowTone={(r) => r.tone}
        columns={[
          {
            key: 'series',
            sticky: true,
            header: <span className="sr-only">{SERIES_COLUMN_LABEL}</span>,
            cell: (r) => <span className="flex items-center gap-2">{r.label}</span>,
          },
          ...points.map((p) => ({
            key: p.date,
            header: (
              <>
                {p.label}
                <br />
                <span className="num">{p.sublabel}</span>
              </>
            ),
            numeric: true,
            faint: (r: SeriesRow) => r.value(p) == null,
            tone: (r: SeriesRow) => r.cellTone?.(p),
            cell: (r: SeriesRow) => seriesCell(r, p),
          })),
        ]}
      />
    </div>
  )

  const colorSeries: ChartSeries[] = [
    ...earlierRounds.map((r) => ({
      key: `chart-prev-${String(Math.min(r, 3))}` as ChartKey,
      name: roundLabel(r, rounds),
      sample: <SeriesKey round={r} />,
    })),
    { key: 'chart-1', name: roundLabel(rounds, rounds), sample: <SeriesKey /> },
    ...(hasModel ? [{ key: 'chart-model' as const, name: MODEL_LEGEND, sample: <SeriesKey model /> }] : []),
    { key: 'chart-2', name: REAL_ERP_LABEL, sample: <SeriesKey dashed /> },
    ...(parts.names.length > 1
      ? parts.names.slice(0, PART_COLOR.length).map((name, k) => ({
          key: `chart-part-${String(k + 1)}` as ChartKey,
          name,
          sample: <PartKey index={k} />,
          fill: true,
        }))
      : []),
  ]

  // Filtro «Líneas»: cada serie que hay en el gráfico, en el orden de la leyenda.
  const lineOptions: { id: LineSeriesId; name: string }[] = [
    ...earlierRounds.map((r) => ({ id: `e${r - 1}` as LineSeriesId, name: roundLabel(r, rounds) })),
    { id: 'a', name: roundLabel(rounds, rounds) },
    ...(hasModel ? [{ id: 'c' as const, name: MODEL_LEGEND }] : []),
    { id: 'b', name: REAL_ERP_LABEL },
    ...(parts.names.length > 1 ? [{ id: 'parts' as const, name: PARTS_LINE_LABEL }] : []),
  ]
  const shownCount = lineOptions.filter((o) => showLine(o.id)).length
  const linesFilter = (
    <FilterMenu
      icon={<ChartLine />}
      title={LINES_FILTER_LABEL}
      label={shownCount === lineOptions.length ? ALL_LINES_LABEL : linesCount(shownCount)}
      active={shownCount < lineOptions.length}
    >
      <CheckItem checked={shownCount === lineOptions.length} onToggle={() => setHiddenLines([])}>
        {ALL_LINES_LABEL}
      </CheckItem>
      <DropdownMenuSeparator />
      {lineOptions.map((o) => (
        <CheckItem
          key={o.id}
          checked={showLine(o.id)}
          onToggle={() => {
            const next = toggleIn(hiddenLines, o.id)
            // Siempre queda al menos una línea.
            if (next.length < lineOptions.length) setHiddenLines(next)
          }}
        >
          {o.name}
        </CheckItem>
      ))}
    </FilterMenu>
  )

  // La medida: con «Limpiar» vuelve a kg.
  const measureChips =
    measure === DEFAULT_MEASURE
      ? []
      : [{ key: MEASURE_PARAM, label: MEASURE_LABEL[measure], onClear: () => setMeasure(DEFAULT_MEASURE) }]

  return (
    <div>
      <PageHeader title={VERSUS_TITLE} subtitle={VERSUS_SUBTITLE} sticky={false} />
      <DashboardFilterBar
        chips={measureChips}
        extra={
          <FilterMenu
            icon={<Scale />}
            title={MEASURE_FILTER_LABEL}
            label={MEASURE_LABEL[measure]}
            active={measure !== DEFAULT_MEASURE}
          >
            <DropdownMenuRadioGroup value={measure} onValueChange={(v) => setMeasure(parseMeasure(v))}>
              {MEASURES.map((m) => (
                <DropdownMenuRadioItem key={m} value={m}>
                  {MEASURE_LABEL[m]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </FilterMenu>
        }
      />
      <DashboardTabs />
      <PageBody>
        <SyncStatus queries={[data, history, model]} />
        <KpiStrip className="mb-4">
          <Kpi
            tone="primary"
            label={PROJECTED_KPI}
            value={<KpiAmount value={vs.projected[main]} unit={main} />}
            foot={
              <>
                {both && <span>{amountText(vs.projected[other], other)}</span>}
                <span>{daysWithRealFoot(vs.daysWithReal)}</span>
              </>
            }
          />
          <Kpi
            tone="kg"
            label={REAL_ERP_LABEL}
            value={<KpiAmount value={vs.real[main]} unit={main} />}
            foot={both ? amountText(vs.real[other], other) : undefined}
          />
          <Kpi
            label={DEVIATION_KPI}
            value={
              noReal ? (
                <span className="text-faint">—</span>
              ) : (
                <span className={tone(vs.deviationPct[main])}>
                  <CountUp value={vs.deviationPct[main]} decimals={1} suffix="%" />
                </span>
              )
            }
            foot={
              noReal ? (
                NO_REAL_FOOT
              ) : (
                <>
                  <span>{amountsText(vs.diff, units)}</span>
                  {both && <span>{inUnitFoot(pctText(vs.deviationPct[other]), other)}</span>}
                </>
              )
            }
          />
          <Kpi
            label={ACCURACY_KPI}
            value={
              noReal ? (
                <span className="text-faint">—</span>
              ) : (
                <CountUp value={vs.accuracyPct[main]} decimals={1} suffix="%" />
              )
            }
            foot={
              <>
                {both && !noReal && <span>{inUnitFoot(percentText(vs.accuracyPct[other]), other)}</span>}
                <span>{ACCURACY_FOOT}</span>
              </>
            }
          />
        </KpiStrip>
        <div
          className={cn(
            'grid grid-cols-1 items-start gap-4',
            !wide && '@7xl/main:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]',
          )}
        >
          <Section
            className="flex flex-col overflow-hidden"
            title={chartTitle(measure)}
            aside={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <FilterMenu
                  icon={<Package />}
                  title={CHART_PRODUCTS_LABEL}
                  label={
                    !picked.length
                      ? ALL_PRODUCTS_LABEL
                      : picked.length > 2
                        ? productsCount(picked.length)
                        : pickedNames.join(', ')
                  }
                  active={picked.length > 0}
                >
                  <CheckItem checked={!picked.length} onToggle={() => setPicked([])}>
                    {ALL_PRODUCTS_LABEL}
                  </CheckItem>
                  {bySubcategory(chartProducts).map((g) => (
                    <div key={g.name ?? ''}>
                      <DropdownMenuSeparator />
                      {g.name && (
                        <DropdownMenuLabel className="text-xs text-muted-foreground">{g.name}</DropdownMenuLabel>
                      )}
                      {g.products.map((p) => (
                        <CheckItem
                          key={p.id}
                          checked={picked.includes(p.id)}
                          onToggle={() => setPicked(toggleIn(picked, p.id))}
                        >
                          {p.name}
                        </CheckItem>
                      ))}
                    </div>
                  ))}
                </FilterMenu>
                {linesFilter}
                <ChartColorsButton series={colorSeries} iconOnly />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden @7xl/main:inline-flex"
                  aria-pressed={wide}
                  title={wide ? WIDE_OFF_LABEL : WIDE_ON_LABEL}
                  onClick={() => setWide(!wide)}
                >
                  {wide ? (
                    <Columns2 aria-hidden className="size-4" />
                  ) : (
                    <RectangleHorizontal aria-hidden className="size-4" />
                  )}
                  <span className="sr-only">{wide ? WIDE_OFF_LABEL : WIDE_ON_LABEL}</span>
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" title={EXPAND_TITLE}>
                      <Maximize2 aria-hidden className="size-4" />
                      <span className="sr-only">{EXPAND_LABEL}</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="flex h-[92dvh] w-[96vw] max-w-none flex-col gap-3 sm:max-w-none">
                    <div className="pr-12">
                      <DialogTitle className="text-xl font-bold">{chartTitle(measure)}</DialogTitle>
                      <DialogDescription className="text-sm text-muted-foreground">
                        {rangeLabel(period.from, period.to, true)}
                      </DialogDescription>
                    </div>
                    {legend}
                    <div className="relative min-h-0 flex-1">{chart}</div>
                  </DialogContent>
                </Dialog>
              </div>
            }
          >
            <div className="flex flex-1 flex-col px-4 pt-3 pb-4 dsk:px-5">
              {legend}
              {/* Ocupa el alto que deja la tarjeta (con un mínimo): sin huecos blancos. */}
              <div className="relative min-h-64 flex-1 dsk:min-h-80">{chart}</div>
              {seriesTable}
            </div>
          </Section>
          <Section title={PRODUCTS_TITLE}>
            <div className="relative overflow-x-auto">
              {vs.daysWithReal ? (
                <DataTable
                  density="compact"
                  rows={productRows}
                  rowKey={(r) => r.product.id}
                  totalLabel={TOTAL_LABEL}
                  columns={productColumns}
                />
              ) : (
                <EmptyState title={NO_REAL_TITLE}>{NO_REAL_BODY}</EmptyState>
              )}
            </div>
          </Section>
        </div>
      </PageBody>
    </div>
  )
}
