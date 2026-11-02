import type { FileSaver } from '@/modules/planning/application/ports'

/** Descarga el archivo desde el navegador. */
export class BrowserFileSaver implements FileSaver {
  save(fileName: string, content: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
}
