/** Textos de «Proyección vs pedido real» (única fuente; la pantalla no los arma). */
import { nf0, nf1, pct1 } from '@/shared/domain/format'
import { UNITS_SHORT, kgAmount, unitsCount } from '@/shared/types/labels'
import type { Amount, Measure, Unit } from '@/features/dashboards/domain/versus'

export const VERSUS_TITLE = 'Proyección vs pedido real'
export const VERSUS_SUBTITLE = 'Comparativo de proyección y pedido real por producto'

/** Filtro de medida. */
export const MEASURE_FILTER_LABEL = 'Medida'
export const MEASURE_LABEL: Record<Measure, string> = {
  unidades: 'Unidades',
  kg: 'Kg',
  ambos: 'Unidades y kg',
}

/** Abreviatura de cada medida («kg», «unid.»). */
export const UNIT_SHORT: Record<Unit, string> = { kg: 'kg', units: UNITS_SHORT }
/** Encabezado corto de columna («Kg», «Unid.»). */
export const UNIT_COLUMN: Record<Unit, string> = { kg: 'Kg', units: 'Unid.' }
/** Sufijo de un rótulo según la medida: «(kg)», «(unid.)» o «(kg / unid.)». */
export const measureSuffix = (units: Unit[]) => `(${units.map((u) => UNIT_SHORT[u]).join(' / ')})`

/** Una cifra en su medida, para la tabla bajo el gráfico (sin decimales). */
export const seriesNumber = (n: number) => nf0(n)
/** Una cifra en su medida, para la tabla por producto (kg con un decimal). */
export const productNumber = (n: number, unit: Unit) => (unit === 'kg' ? nf1(n) : nf0(n))
/** Una cifra con su medida («12.5 kg», «12 unid.»). */
export const amountText = (n: number, unit: Unit) => (unit === 'kg' ? kgAmount(n) : unitsCount(n))
/** Las medidas elegidas de una cifra: «12.5 kg · 10 unid.». */
export const amountsText = (a: Amount, units: Unit[]) => units.map((u) => amountText(a[u], u)).join(' · ')
export const pctText = pct1
/** Un porcentaje sin signo («92.5%»). */
export const percentText = (n: number) => `${nf1(n)}%`

/** Series del gráfico y de su tabla. */
export const REAL_LABEL = 'Pedido real'
export const REAL_ERP_LABEL = 'Pedido real (ERP)'
export const MODEL_LABEL = 'Modelo'
export const MODEL_LEGEND = 'Modelo (sugerencia)'
export const DIFF_PCT_LABEL = 'Dif. (%)'
export const SERIES_COLUMN_LABEL = 'Serie'
/** Nombre de cada ronda: «Proyección 1», «Proyección 2»…; la última es la vigente. */
export const roundLabel = (r: number, rounds: number) =>
  rounds === 1 ? 'Proyección' : r === rounds ? `Proyección ${String(r)} (vigente)` : `Proyección ${String(r)}`

/** KPIs. */
export const PROJECTED_KPI = 'Proyección'
export const DEVIATION_KPI = 'Desviación'
export const ACCURACY_KPI = 'Exactitud'
export const daysWithRealFoot = (n: number) => `${String(n)} días con pedido registrado`
export const NO_REAL_FOOT = 'sin pedidos del ERP'
export const ACCURACY_FOOT = 'según días con pedido'
/** Pie de un KPI con «Unidades y kg»: la cifra en la otra medida. */
export const inUnitFoot = (text: string, unit: Unit) => `${text} en ${unit === 'kg' ? 'kg' : 'unidades'}`

/** Gráfico. */
export const chartTitle = (m: Measure) =>
  m === 'unidades'
    ? 'Evolución en el período (unid.)'
    : m === 'ambos'
      ? 'Evolución en el período (unid. y kg)'
      : 'Evolución en el período (kg)'
export const chartAria = (unit: Unit) =>
  unit === 'kg' ? 'Kilogramos proyectados y pedidos por día' : 'Unidades proyectadas y pedidas por día'
/** Con «Kg y unidades» el gráfico va en kg: se avisa dónde están las unidades. */
export const BOTH_CHART_NOTE = 'El gráfico va en unidades; los kg, en el detalle de cada punto y en la tabla.'
export const CHART_EMPTY_TITLE = 'Sin proyecciones en este período'
export const CHART_EMPTY_BODY = 'Cuando se registren, verás aquí la proyección y el pedido real de cada día.'
export const NO_PROJECTION_TIP = 'Sin proyección'
export const NO_REAL_TIP = `${REAL_LABEL}: sin datos aún`
export const DIFF_TIP = 'Diferencia'
export const partsLegend = (byProduct: boolean) => `Proyección vigente por ${byProduct ? 'producto' : 'tamaño'}:`

/** Productos del gráfico. */
export const CHART_PRODUCTS_LABEL = 'Productos del gráfico'
export const ALL_PRODUCTS_LABEL = 'Total de productos'
export const productsCount = (n: number) => `${String(n)} productos`

/** Tabla por producto. */
export const PRODUCTS_TITLE = 'Desviación por producto'
export const PRODUCT_LABEL = 'Producto'
export const PROJECTION_LABEL = 'Proyección'
export const DIFF_LABEL = 'Dif.'
export const TOTAL_LABEL = 'Total'
export const NO_REAL_TITLE = 'Sin pedidos registrados'
export const NO_REAL_BODY = 'Este período aún no tiene pedidos del ERP.'

/** Botones del gráfico: ampliar y ancho completo. */
export const EXPAND_LABEL = 'Ampliar'
export const EXPAND_TITLE = 'Ver el gráfico en grande'
export const WIDE_ON_LABEL = 'Ancho completo'
export const WIDE_OFF_LABEL = 'Junto a la tabla'

/** Filtro «Líneas» del gráfico: qué series se ven. */
export const LINES_FILTER_LABEL = 'Líneas del gráfico'
export const ALL_LINES_LABEL = 'Todas las líneas'
export const PARTS_LINE_LABEL = 'Franjas por tamaño'
export const linesCount = (n: number) => (n === 1 ? '1 línea' : `${String(n)} líneas`)

/** Tabla «Desviación por vendedor». */
export const SELLERS_TITLE = 'Desviación por vendedor'
export const SELLERS_HINT =
  'Todos los vendedores del período. Cada uno cuenta solo los días en que tuvo pedido, por eso el total puede diferir del de arriba. Toca un nombre para filtrar solo por él.'
export const SELLER_LABEL = 'Vendedor'
export const SELLER_READING_LABEL = 'Lectura'
export const SELLER_PCT_TITLE = 'Se ordena por la mayor desviación, sin importar el signo.'
export const SELLERS_EMPTY_TITLE = 'Sin pedidos por vendedor'
export const SELLERS_EMPTY_BODY = 'Cuando haya pedidos del ERP en este período, verás aquí a cada vendedor.'
export const sortByLabel = (name: string) => `Ordenar por ${name}`
export const SELLER_READING: Record<'under' | 'over' | 'even' | 'none', string> = {
  under: 'Proyectó de menos',
  over: 'Proyectó de más',
  even: 'Sin desviación',
  none: 'Sin proyección',
}
