"""Raíz de composición de la ingesta: el único lugar que conecta puertos con adaptadores.

Para cambiar un adaptador (otro almacenamiento, otro lector de archivos, otro motor de base)
se toca solo este archivo.
"""

from functools import cached_property

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.ingest.application import use_cases as uc
from app.ingest.application.ports import IngestRepository
from app.ingest.application.service import IngestService
from app.ingest.infrastructure.config import get_catalog, get_schema
from app.ingest.infrastructure.files.reader import PandasFileReader
from app.ingest.infrastructure.lakehouse import DeltaAnalyticsStore
from app.ingest.infrastructure.persistence.repository import SqlIngestRepository
from app.shared.infrastructure.lakehouse import Lakehouse, get_lakehouse


def build_service(
    repo: IngestRepository, settings: Settings, lakehouse: Lakehouse | None = None
) -> IngestService:
    """IngestService con los adaptadores reales (lo usan la API y los scripts)."""
    lakehouse = lakehouse or get_lakehouse(settings)
    return IngestService(
        bronze=lakehouse,
        analytics=DeltaAnalyticsStore(lakehouse),
        reader=PandasFileReader(),
        repo=repo,
        schema=get_schema(),
        catalog=get_catalog(),
    )


class IngestUseCases:
    """Casos de uso de una petición. El lakehouse se abre solo si el caso de uso lo necesita
    (consultar el log o los mapeos no toca LAKEHOUSE_URI)."""

    def __init__(self, session: Session, settings: Settings) -> None:
        self.repo = SqlIngestRepository(session)
        self.settings = settings
        self.schema = get_schema()
        self.list_log = uc.ListIngestionLog(self.repo)
        self.list_mappings = uc.ListMappings(self.repo)
        self.propose_mapping = uc.ProposeMapping(self.repo, self.schema)

    @cached_property
    def service(self) -> IngestService:
        return build_service(self.repo, self.settings)

    @cached_property
    def reprocess_file(self) -> uc.ReprocessFile:
        return uc.ReprocessFile(self.service)

    @cached_property
    def confirm_mapping(self) -> uc.ConfirmMapping:
        return uc.ConfirmMapping(self.repo, self.repo, self.service)


def build_use_cases(session: Session, settings: Settings) -> IngestUseCases:
    return IngestUseCases(session, settings)
