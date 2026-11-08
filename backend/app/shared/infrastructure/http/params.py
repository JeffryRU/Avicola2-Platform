"""Tipos de parámetros HTTP compartidos.

Los ids de las tablas son `Integer` (int4 en Postgres, hasta 2 147 483 647). Un id más grande
no existe, pero sin este límite llegaría a la base y la consulta fallaría con un 500 (lo encontró
el fuzzing: tests/test_api_fuzz.py). Con el límite, FastAPI responde 422.
"""

from typing import Annotated

from fastapi import Path
from pydantic import Field

MAX_DB_ID = 2_147_483_647

DbId = Annotated[int, Field(ge=1, le=MAX_DB_ID)]
DbIdPath = Annotated[int, Path(ge=1, le=MAX_DB_ID)]
