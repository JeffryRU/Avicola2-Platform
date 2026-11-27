import { useId, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Calculator,
  Check,
  Drumstick,
  Layers,
  Search,
  X,
} from 'lucide-react'
import { parseCell } from '@/shared/domain/format'
import { bySubcategory, type Product } from '@/shared/domain/products'
import { Segmented } from '@/shared/ui/components/segmented'
import { FilterMenu } from '@/shared/ui/components/filter-menu'
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/shared/ui/components/shadcn/dropdown-menu'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { DataTable } from '@/shared/ui/components/data-table'
import { EmptyState } from '@/shared/ui/components/feedback'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { categoryName, kgPerUnitLabel } from '@/features/catalog/types/catalog'
import {
  ALL_SIZES,
  CATEGORY_LABEL,
  CALC_HINT,
  CALC_PRODUCT,
  CALC_RESULT,
  CALC_TITLE,
  CALC_UNITS,
  CLEAR_FILTERS,
  IN_CALCULATOR,
  KG_PER_UNIT,
  NO_MATCH_BODY,
  NO_MATCH_TITLE,
  NO_SIZE,
  PICK_FOR_CALC,
  PRODUCTS_SUBTITLE,
  PRODUCTS_TITLE,
  SEARCH_LABEL,
  SEARCH_PLACEHOLDER,
  SIZE_LABEL,
  SORT_LABEL,
  SORT_NAMES,
  SORT_NEXT,
  TABLE_KG,
  TABLE_PRODUCT,
  VIEW_NAMES,
  calcNote,
  productsCount,
  tableUnitsHeader,
} from '@/features/catalog/types/products-page'
import {
  NO_FILTER,
  PRODUCT_SORTS,
  filterProducts,
  isFiltered,
  type ProductFilter,
  type ProductSort,
} from '@/features/catalog/domain/product-filter'
import { kgAmount } from '@/shared/types/labels'
import { cn } from '@/shared/ui/lib/utils'

type View = 'cards' | 'table'

/** Ícono de cada orden: catálogo (flechas), livianos primero (ascendente), pesados primero (descendente). */
const SORT_ICON: Record<ProductSort, typeof ArrowUpDown> = {
  catalog: ArrowUpDown,
  light: ArrowUpNarrowWide,
  heavy: ArrowDownWideNarrow,
}

/** Atajos de la calculadora (unidades frecuentes). */
const QUICK_UNITS = [10, 50, 100, 500]

/** Botón tipo píldora del filtro de tamaño. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-touch items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-muted dsk:min-h-8',
        on && 'border-primary bg-selected text-selected-foreground hover:bg-selected',
      )}
    >
      {on && <Check aria-hidden className="size-3.5" />}
      {children}
    </button>
  )
}

/** Tarjeta de un producto: su peso grande, una barra relativa al más pesado y su tamaño. */
function ProductCard({
  p,
  max,
  selected,
  onPick,
  showSize,
}: {
  p: Product
  max: number
  selected: boolean
  onPick: () => void
  /** El tamaño debajo del nombre (no hace falta si las tarjetas ya van bajo su tamaño). */
  showSize: boolean
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      aria-label={PICK_FOR_CALC(p.name)}
      className={cn(
        'group grid gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/40',
        selected && 'border-primary bg-selected/40 ring-2 ring-primary/30',
      )}
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <b className="block truncate font-semibold">{p.name}</b>
          {showSize && (
            <small className="block text-xs text-muted-foreground">{p.subcategory ?? categoryName(p.category)}</small>
          )}
        </span>
        {selected && (
          <span className="inline-flex flex-none items-center gap-1 rounded-sm bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
            <Calculator aria-hidden className="size-3" />
            <span className="sr-only">{IN_CALCULATOR}</span>
          </span>
        )}
      </span>
      <span>
        <span className="num title-display text-3xl text-head dark:text-foreground">{p.kg_per_unit.toFixed(2)}</span>
        <span className="ml-1 text-sm text-muted-foreground">{KG_PER_UNIT}</span>
      </span>
      <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${String(Math.round((100 * p.kg_per_unit) / max))}%` }}
        />
      </span>
    </button>
  )
}

/** Calculadora de unidades a kilos: fija al costado en escritorio, arriba en el celular. */
function CalculatorPanel({
  products,
  selected,
  onProduct,
  units,
  onUnits,
}: {
  products: Product[]
  selected: Product
  onProduct: (id: string) => void
  units: number | null
  onUnits: (u: number | null) => void
}) {
  const productId = useId()
  const unitsId = useId()
  return (
    <Section title={CALC_TITLE} className="@5xl/main:sticky @5xl/main:top-4">
      <div className="grid gap-4 px-4 pt-3 pb-5 dsk:px-5">
        <p className="-mt-1 text-sm text-muted-foreground">{CALC_HINT}</p>
        <div className="grid gap-1.5">
          <label id={productId} className="text-sm font-medium text-ink-2">
            {CALC_PRODUCT}
          </label>
          <Select value={selected.id} onValueChange={onProduct}>
            <SelectTrigger aria-labelledby={productId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={unitsId} className="text-sm font-medium text-ink-2">
            {CALC_UNITS}
          </label>
          <Input
            id={unitsId}
            inputMode="numeric"
            value={units ?? ''}
            onChange={(e) => onUnits(parseCell(e.target.value))}
            className="num"
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_UNITS.map((u) => (
              <Chip key={u} on={units === u} onClick={() => onUnits(u)}>
                <span className="num">{u}</span>
              </Chip>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-selected/60 px-4 py-3">
          <small className="block text-sm font-medium text-selected-foreground">{CALC_RESULT}</small>
          <div
            className="num title-display text-4xl text-primary hc:font-extrabold hc:text-foreground"
            data-testid="calc-result"
            aria-live="polite"
          >
            {kgAmount((units ?? 0) * selected.kg_per_unit)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {calcNote(selected.name, kgPerUnitLabel(selected.kg_per_unit))}
          </p>
        </div>
      </div>
    </Section>
  )
}

export function ProductsPage() {
  const { catalog } = useCatalog()
  const [category, setCategory] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [units, setUnits] = useState<number | null>(10)
  const [filter, setFilter] = useState<ProductFilter>(NO_FILTER)
  const [view, setView] = useState<View>('cards')
  const searchId = useId()
  if (!catalog) return <PageHeader title={PRODUCTS_TITLE} subtitle={PRODUCTS_SUBTITLE} />

  const cat = category ?? catalog.categories[0]
  const products = catalog.of(cat)
  const sizes = catalog.subcategories(cat)
  const shown = filterProducts(products, filter)
  const selected = products.find((p) => p.id === productId) ?? products[0]
  const max = Math.max(...products.map((p) => p.kg_per_unit), 1e-9)
  const set = (patch: Partial<ProductFilter>) => setFilter((f) => ({ ...f, ...patch }))
  // Con el orden del catálogo se agrupa por tamaño; ordenado por peso, una sola lista.
  const groups =
    filter.sort === 'catalog' && sizes.length > 1 ? bySubcategory(shown) : [{ name: null, products: shown }]

  const list =
    shown.length === 0 ? (
      <Section>
        <EmptyState title={NO_MATCH_TITLE}>
          <span className="block">{NO_MATCH_BODY}</span>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilter(NO_FILTER)}>
            <X aria-hidden className="size-4" />
            {CLEAR_FILTERS}
          </Button>
        </EmptyState>
      </Section>
    ) : view === 'table' ? (
      <Section>
        <DataTable
          rows={shown}
          rowKey={(p) => p.id}
          onRowClick={(p) => setProductId(p.id)}
          rowClassName={(p) => p.id === selected.id && 'bg-selected/50'}
          columns={[
            {
              key: 'name',
              header: TABLE_PRODUCT,
              cell: (p) => (
                <>
                  <span className="font-medium">{p.name}</span>
                  {p.subcategory && <small className="block text-xs text-muted-foreground">{p.subcategory}</small>}
                </>
              ),
            },
            { key: 'kg', header: TABLE_KG, numeric: true, cell: (p) => p.kg_per_unit.toFixed(2) },
            {
              key: 'units',
              header: tableUnitsHeader(units ?? 0),
              numeric: true,
              cell: (p) => kgAmount(p.kg_per_unit * (units ?? 0)),
            },
          ]}
        />
      </Section>
    ) : (
      <div className="grid gap-5">
        {groups.map((g) => (
          <section key={g.name ?? 'all'} className="grid gap-2.5">
            {groups.length > 1 && (
              <h2 className="flex items-center gap-3 text-md font-bold text-head dark:text-foreground">
                {g.name ?? NO_SIZE}
                <span className="num rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-ink-2">
                  {g.products.length}
                </span>
                <span aria-hidden className="h-px flex-1 bg-rule-strong" />
              </h2>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 @4xl/main:grid-cols-3">
              {g.products.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  max={max}
                  selected={p.id === selected.id}
                  onPick={() => setProductId(p.id)}
                  showSize={groups.length === 1}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    )

  return (
    <div>
      <PageHeader title={PRODUCTS_TITLE} subtitle={PRODUCTS_SUBTITLE} />
      <PageBody>
        {/* Filtros: categoría, tamaño, búsqueda, orden y vista. */}
        <div className="panel mb-4 p-3 dsk:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <FilterMenu icon={<Layers />} title={CATEGORY_LABEL} label={categoryName(cat)}>
              <DropdownMenuRadioGroup
                value={cat}
                onValueChange={(c) => {
                  setCategory(c)
                  setProductId(null)
                  setFilter(NO_FILTER)
                }}
              >
                {catalog.categories.map((c) => (
                  <DropdownMenuRadioItem key={c} value={c}>
                    {categoryName(c)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </FilterMenu>
            {sizes.length > 0 && (
              <FilterMenu
                icon={<Drumstick />}
                title={SIZE_LABEL}
                label={filter.size ?? ALL_SIZES}
                active={filter.size !== null}
              >
                <DropdownMenuRadioGroup value={filter.size ?? ''} onValueChange={(v) => set({ size: v || null })}>
                  <DropdownMenuRadioItem value="">{ALL_SIZES}</DropdownMenuRadioItem>
                  <DropdownMenuSeparator />
                  {sizes.map((s) => (
                    <DropdownMenuRadioItem key={s} value={s}>
                      {s}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </FilterMenu>
            )}
            <label htmlFor={searchId} className="sr-only">
              {SEARCH_LABEL}
            </label>
            <div className="relative min-w-48 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={searchId}
                type="search"
                value={filter.search}
                placeholder={SEARCH_PLACEHOLDER}
                onChange={(e) => set({ search: e.target.value })}
                className="pl-9"
              />
            </div>
            {(() => {
              // Un solo botón: cada toque pasa al siguiente orden (catálogo → livianos → pesados).
              const next = PRODUCT_SORTS[(PRODUCT_SORTS.indexOf(filter.sort) + 1) % PRODUCT_SORTS.length]
              const Icon = SORT_ICON[filter.sort]
              return (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`${SORT_LABEL}: ${SORT_NAMES[filter.sort]}. ${SORT_NEXT(SORT_NAMES[next])}`}
                  title={`${SORT_NAMES[filter.sort]} · ${SORT_NEXT(SORT_NAMES[next])}`}
                  onClick={() => set({ sort: next })}
                  className={cn(
                    filter.sort !== 'catalog' &&
                      'border-primary bg-selected text-selected-foreground hover:bg-selected',
                  )}
                >
                  <Icon aria-hidden className="size-4.5" />
                </Button>
              )
            })()}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'cards', label: VIEW_NAMES.cards },
                { value: 'table', label: VIEW_NAMES.table },
              ]}
            />
            <span className="flex w-full items-center justify-end gap-3 text-sm text-muted-foreground @5xl/main:ml-auto @5xl/main:w-auto">
              <span className="num">{productsCount(shown.length, products.length)}</span>
              {isFiltered(filter) && (
                <Button variant="ghost" size="sm" onClick={() => setFilter(NO_FILTER)}>
                  <X aria-hidden className="size-4" />
                  {CLEAR_FILTERS}
                </Button>
              )}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 @5xl/main:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="order-2 min-w-0 @5xl/main:order-1">{list}</div>
          <div className="order-1 @5xl/main:order-2">
            <CalculatorPanel
              products={products}
              selected={selected}
              onProduct={setProductId}
              units={units}
              onUnits={setUnits}
            />
          </div>
        </div>
      </PageBody>
    </div>
  )
}
