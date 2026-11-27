import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DataTable, type Column } from '@/shared/ui/components/data-table'
import { headerGroups } from '@/shared/ui/lib/data-table'

interface Row {
  id: string
  name: string
  a: number
  b: number
}
const ROWS: Row[] = [
  { id: '1', name: 'Brasa 1', a: 3, b: 0 },
  { id: '2', name: 'Brasa 2', a: 0, b: 5 },
]
const columns: Column<Row>[] = [
  { key: 'name', header: 'Producto', sticky: true, cell: (r) => r.name },
  { key: 'a', header: 'Hebert', group: 'Chiclayo', numeric: true, faint: (r) => !r.a, cell: (r) => r.a, total: 3 },
  { key: 'b', header: 'César', group: 'Trujillo', numeric: true, cell: (r) => r.b, total: 5 },
  { key: 't', header: 'Total', numeric: true, cell: (r) => r.a + r.b, total: 8 },
]
const html = (props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) =>
  renderToStaticMarkup(<DataTable columns={columns} rows={ROWS} rowKey={(r) => r.id} totalLabel="Total" {...props} />)

describe('DataTable', () => {
  it('agrupa los encabezados seguidos del mismo grupo', () => {
    expect(headerGroups([null, 'Trujillo', 'Trujillo', null, 'Piura'])).toEqual([
      { name: null, span: 1 },
      { name: 'Trujillo', span: 2 },
      { name: null, span: 1 },
      { name: 'Piura', span: 1 },
    ])
  })

  it('con grupos: dos filas de encabezado, las columnas sin grupo ocupan ambas y los nombres van centrados', () => {
    const out = html()
    expect(out.match(/<tr>/g)).toHaveLength(2)
    expect(out).toContain('colSpan="1" scope="colgroup"')
    expect(out).toMatch(/rowSpan="2"[^>]*>Producto</)
    expect(out).toMatch(/text-center[^>]*>Hebert</)
  })

  it('cifras a la derecha, ceros atenuados, columna fija y fila de total', () => {
    const out = html()
    expect(out).toMatch(/class="[^"]*num[^"]*text-faint[^"]*">0</)
    expect(out).toMatch(/sticky left-0[^>]*>Brasa 1</)
    expect(out).toMatch(/>Total<\/td>.*>3<\/td>.*>5<\/td>.*>8<\/td>/)
  })

  it('filas agrupadas bajo un encabezado lateral', () => {
    const out = html({
      rows: undefined,
      groups: [{ key: 'chica', label: 'Brasa chica', rows: ROWS }],
      groupHeader: 'Tamaño',
    })
    expect(out).toMatch(/scope="rowgroup" rowSpan="2"[^>]*>Brasa chica</)
    expect(out).toContain('>Tamaño<')
  })

  it('sin totales no hay fila de total', () => {
    const plain = columns.map((c) => ({ ...c, total: undefined }))
    expect(html({ columns: plain })).not.toContain('>Total</td>')
  })
})

describe('opciones de la tabla', () => {
  it('cada módulo elige densidad, rayado, cabecera fija y hover', () => {
    const out = html({ density: 'compact', striped: true, stickyHeader: true, hover: false })
    expect(out).toContain('text-sm')
    expect(out).toContain('even:bg-muted/50')
    expect(out).toContain('sticky top-0')
    expect(out).not.toContain('hover:bg-muted')
  })

  it('las filas que se abren se pueden abrir con el teclado', () => {
    const out = html({ onRowClick: () => undefined })
    expect(out.match(/tabindex="0"/gi)).toHaveLength(2)
    expect(out).toContain('cursor-pointer')
  })

  it('tonos de celda y de fila salen de la misma fuente de estilos', () => {
    const toned: Column<Row>[] = [
      { key: 'name', header: 'Producto', cell: (r) => r.name },
      { key: 'a', header: 'A', numeric: true, tone: (r) => (r.a ? 'best' : 'bad'), cell: (r) => r.a },
    ]
    const out = html({ columns: toned, rowTone: (r) => r.id === '2' && 'attention' })
    expect(out).toContain('bg-ok-soft')
    expect(out).toContain('text-bad')
    expect(out).toContain('hc:bg-warn-soft')
  })
})

describe('columnas listas', () => {
  it('unidades, kg y variación con su formato, «—» y tono', async () => {
    const { col, signTone } = await import('@/shared/ui/lib/table-columns')
    const units = col.units<Row>('a', 'A', (r) => r.a, { dashZero: true })
    expect(units.cell(ROWS[0], 0)).toBe('3')
    expect(units.cell(ROWS[1], 0)).toBe('—')
    expect(units.faint?.(ROWS[1])).toBe(true)
    const kg = col.kg<Row>('k', 'Kg', (r) => r.a * 1.25)
    expect(kg.cell(ROWS[0], 0)).toBe('3.8')
    const change = col.change<Row>('c', '%', (r) => r.b - r.a)
    expect(change.cell(ROWS[0], 0)).toBe('-3.0%')
    expect(typeof change.tone === 'function' && change.tone(ROWS[0])).toBe('bad')
    expect(typeof change.tone === 'function' && change.tone(ROWS[1])).toBe('ok')
    expect(signTone(-1)).toBe('bad')
  })
})
