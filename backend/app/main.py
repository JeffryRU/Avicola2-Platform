"""Punto de entrada de la API."""

from fastapi import FastAPI

from app.api import health

app = FastAPI(title="Avícola 2 — Planificación de saca", version="0.1.0")
app.include_router(health.router)
