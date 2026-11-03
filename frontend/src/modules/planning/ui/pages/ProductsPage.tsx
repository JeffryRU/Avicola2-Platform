import { useState } from 'react'
import { nf1 } from '@/core/domain/format'
import { parseCell } from '@/modules/planning/domain/draft'
import { Segmented } from '@/modules/planning/ui/components/dashboard'
import { useCatalog } from '@/modules/planning/ui/hooks'
import { PageBody, PageHeader, Section, tableCls } from '@/ui/components/layout'
import { Input } from '@/ui/components/shadcn/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/shadcn/select'
import { cn } from '@/ui/lib/utils'

export function ProductsPage() {
  const { catalog } = useCatalog()
  const [category, setCategory] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [units, setUnits] = useState<number | null>(10)
  if (!catalog) return <PageHeader title="Productos" subtitle="Presentaciones y conversión de unidades a kilos." />

  const cat = category ?? catalog.categories[0]
  const products = catalog.of(cat)
  const selected = products.find((p) => p.id === productId) ?? products[0]
  const right = '[&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right'

  return (
    <div>
      <PageHeader title="Productos" subtitle="Presentaciones y conversión de unidades a kilos." />
      <PageBody>
        <Segmented
          className="mb-3.5"
          value={cat}
          onChange={(c) => {
            setCategory(c)
            setProductId(null)
          }}
          options={catalog.categories.map((c) => ({ value: c, label: c }))}
        />
        <div className="grid items-start gap-4 dsk:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Section title="Calculadora">
            <div className="px-4 pt-1.5 pb-4 dsk:px-5 dsk:pb-5">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label id="calc-p" className="mb-1.5 block font-bold">
                    Producto
                  </label>
                  <Select value={selected.id} onValueChange={setProductId}>
                    <SelectTrigger
                      aria-labelledby="calc-p"
                      className="!h-11 w-[170px] rounded-[10px] border-[1.5px] bg-white font-semibold"
                    >
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
                  <label htmlFor="calc-u" className="mb-1.5 block font-bold">
                    Unidades
                  </label>
                  <Input
                    id="calc-u"
                    inputMode="numeric"
                    value={units ?? ''}
                    onChange={(e) => setUnits(parseCell(e.target.value))}
                    className="h-11 w-[140px] rounded-[14px] border-[1.5px] bg-white text-base font-semibold"
                  />
                </div>
                <div>
                  <small className="font-semibold text-muted-foreground">Equivale a</small>
                  <div className="text-[26px] font-extrabold" data-testid="calc-result">
                    {nf1((units ?? 0) * selected.kg_per_unit)} kg
                  </div>
                </div>
              </div>
              <p className="mt-3.5 text-[13px] text-muted-foreground">
                {selected.name} pesa {selected.kg_per_unit.toFixed(2)} kg por unidad, en promedio.
              </p>
            </div>
          </Section>
          <Section
            title={`Catálogo ${cat}`}
            aside={<span className="text-muted-foreground">{products.length} productos</span>}
          >
            <div className="px-3 pb-3.5">
              <table className={cn(tableCls.table, right)}>
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
                        {p.name}
                        {p.subcategory && (
                          <small className="block text-[11.5px] text-muted-foreground">{p.subcategory}</small>
                        )}
                      </td>
                      <td className={tableCls.td}>{p.kg_per_unit.toFixed(2)}</td>
                      <td className={tableCls.td}>{nf1(p.kg_per_unit * 10)} kg</td>
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
