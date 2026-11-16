import { useState } from 'react'
import { parseCell } from '@/shared/domain/format'
import { Segmented } from '@/shared/ui/components/segmented'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { tableCls } from '@/shared/ui/lib/table-styles'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { kgPerUnitLabel } from '@/features/catalog/types/catalog'
import { kgAmount } from '@/shared/types/labels'
import { cn } from '@/shared/ui/lib/utils'

export function ProductsPage() {
  const { catalog } = useCatalog()
  const [category, setCategory] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [units, setUnits] = useState<number | null>(10)
  if (!catalog) return <PageHeader title="Productos" subtitle="Presentaciones y conversión de unidades a kilos." />

  const cat = category ?? catalog.categories[0]
  const products = catalog.of(cat)
  const selected = products.find((p) => p.id === productId) ?? products[0]

  return (
    <div>
      <PageHeader title="Productos" subtitle="Presentaciones y conversión de unidades a kilos." />
      <PageBody>
        <Segmented
          className="mb-4"
          value={cat}
          onChange={(c) => {
            setCategory(c)
            setProductId(null)
          }}
          options={catalog.categories.map((c) => ({ value: c, label: c }))}
        />
        <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Section title="Calculadora">
            <div className="px-4 pt-3 pb-4 dsk:px-5 dsk:pb-5">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label id="calc-p" className="mb-1 block text-sm font-medium text-ink-2">
                    Producto
                  </label>
                  <Select value={selected.id} onValueChange={setProductId}>
                    <SelectTrigger aria-labelledby="calc-p" className="w-44">
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
                <div>
                  <label htmlFor="calc-u" className="mb-1 block text-sm font-medium text-ink-2">
                    Unidades
                  </label>
                  <Input
                    id="calc-u"
                    inputMode="numeric"
                    value={units ?? ''}
                    onChange={(e) => setUnits(parseCell(e.target.value))}
                    className="num w-32"
                  />
                </div>
                <div>
                  <small className="text-sm text-muted-foreground">Equivale a</small>
                  <div className="num text-2xl font-medium hc:font-extrabold" data-testid="calc-result">
                    {kgAmount((units ?? 0) * selected.kg_per_unit)}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {selected.name}: {kgPerUnitLabel(selected.kg_per_unit)}, en promedio.
              </p>
            </div>
          </Section>
          <Section
            title={`Catálogo ${cat}`}
            aside={
              <span>
                <span className="num">{products.length}</span> productos
              </span>
            }
          >
            <div className="relative overflow-x-auto">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>Producto</th>
                    <th className={tableCls.th}>Kg por unidad</th>
                    <th className={tableCls.th}>10 unidades</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className={tableCls.row}>
                      <td className={tableCls.td}>
                        <span className="font-medium">{p.name}</span>
                        {p.subcategory && (
                          <small className="block text-xs text-muted-foreground">{p.subcategory}</small>
                        )}
                      </td>
                      <td className={cn(tableCls.td, 'num')}>{p.kg_per_unit.toFixed(2)}</td>
                      <td className={cn(tableCls.td, 'num')}>{kgAmount(p.kg_per_unit * 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </PageBody>
    </div>
  )
}
