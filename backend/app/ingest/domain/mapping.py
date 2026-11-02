"""Mapeo de columnas: encabezado normalizado → campo, con columnas ignoradas y constantes."""

from app.ingest.domain.normalize import normalize_header
from app.ingest.domain.schema import IngestSchema
from app.shared.domain.errors import DomainError

IGNORE = ""  # en un mapeo confirmado, la columna se ignora
# En un mapeo, una clave "=campo" fija un valor constante para todo el archivo,
# p. ej. {"=type": "proyeccion"} para un Excel de proyecciones sin columna tipo.
CONSTANT_PREFIX = "="


def split_mapping(mapping: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    """Separa un mapeo en {encabezado: campo} y {campo: valor constante}."""
    columns = {h: t for h, t in mapping.items() if not h.startswith(CONSTANT_PREFIX)}
    constants = {
        h.removeprefix(CONSTANT_PREFIX): v
        for h, v in mapping.items()
        if h.startswith(CONSTANT_PREFIX)
    }
    return columns, constants


def validate_mapping(
    schema: IngestSchema, source_columns: list[str] | None, mapping: dict[str, str]
) -> dict[str, str]:
    """Valida un mapeo enviado por el usuario o el LLM y normaliza sus encabezados."""
    fields = schema.fields()
    headers = {normalize_header(c) for c in source_columns or []}
    clean: dict[str, str] = {}
    for header, target in mapping.items():
        if header.startswith(CONSTANT_PREFIX):
            name = header.removeprefix(CONSTANT_PREFIX)
            if name not in fields or not target:
                raise DomainError(f"constante no válida: {header}")
            if name == schema.routing.field and target not in schema.routing.tables:
                raise DomainError(f"tipo no válido: {target} ({', '.join(schema.routing.tables)})")
            clean[header] = target
            continue
        key = normalize_header(header)
        if key not in headers:
            raise DomainError(f"columna desconocida: {header}")
        if target != IGNORE and target not in fields:
            raise DomainError(f"campo desconocido: {target}")
        clean[key] = target
    targets = [t for h, t in clean.items() if t != IGNORE and not h.startswith(CONSTANT_PREFIX)]
    if len(targets) != len(set(targets)):
        raise DomainError("dos columnas apuntan al mismo campo")
    return clean
