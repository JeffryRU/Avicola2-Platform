"""Contratos JSON de la API de planificación (adaptador de entrada)."""

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=200)


class SellerOut(BaseModel):
    username: str
    name: str
    zone: str | None


class LoginOut(BaseModel):
    token: str
    seller: SellerOut


class ProductOut(BaseModel):
    id: str
    category: str
    name: str
    kg_per_unit: float
    sort_order: int


class ProjectionOut(BaseModel):
    id: UUID
    submission_id: UUID
    seller: str
    date: date
    category: str
    status: str
    total_units: int
    total_kg: float
    submitted_at: datetime
    units: dict[str, int]


class DayIn(BaseModel):
    date: date
    units: dict[str, int]


class SubmissionIn(BaseModel):
    """`submission_id` lo genera el cliente: reenviar un envío (cola offline) es idempotente."""

    submission_id: UUID | None = None
    category: str = Field(min_length=1, max_length=30)
    days: list[DayIn] = Field(min_length=1)


class SubmissionOut(BaseModel):
    submission_id: UUID
    days: int
    total_units: int
    total_kg: float


class DailyUnitsOut(BaseModel):
    seller: str
    date: date
    units: dict[str, int]


class SuggestionOut(BaseModel):
    method: str
    days: list[DailyUnitsOut]


StatusOut = dict[str, Any]
