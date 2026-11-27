package pe.avicola2.app.domain

/** Formatos de exportación: los mismos de la web (`EXPORT_FORMATS` en shared/domain/export.ts). */
enum class ExportFormat(val extension: String, val label: String, val hint: String, val mimeType: String) {
    Excel("xlsx", "Excel", ".xlsx, para analizar o filtrar", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    Pdf("pdf", "PDF", "Para imprimir o compartir", "application/pdf"),
    Csv("csv", "CSV", "Texto separado por comas", "text/csv"),
}
