# ruff: noqa: N803, N806, PLR2004 — notación de matrices (Y, X, C) y umbrales del modelo
"""Entrena los modelos de demanda con la historia de ARIS cargada y guarda métricas y predicciones.

Corre fuera de las peticiones HTTP: `cli entrenar` o el programador, de madrugada. División
temporal 70/15/15; las métricas se miden en validación + prueba (días que el modelo no vio). Un
modelo por uso (ADR 0020):

- `robusta`: promedio de 6 modelos de distinto tipo → la sugerencia a cada vendedor.
- `destilado`: alumno (vendedores principales) que aprende de un maestro con todas las series
  → saca por tamaño.
- `apilado`: alumno que usa la predicción del maestro como variable → planificación semanal.
"""

import json
import logging
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

import numpy as np
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.planning.domain.models import Product
from app.planning.domain.orders import ORDER_CATEGORY, ORDER_MATERIAL_PREFIX, OrderLine, product_for
from app.planning.infrastructure.demand_model import core
from app.planning.infrastructure.persistence.tables import (
    dispatch_orders,
    model_predictions,
    model_runs,
)

logger = logging.getLogger(__name__)

MIN_DAYS = (
    100  # días con pedidos para ser un vendedor «principal» (los demás solo enseñan al maestro)
)
UNASSIGNED = "(sin vendedor)"

MODELS = {
    "actual": "Mediana 4 semanas (anterior)",
    "suavizado": "Suavizado exponencial",
    "tsb": "TSB (demanda intermitente)",
    "sba": "SBA (demanda intermitente)",
    "boosting": "Boosting global (Poisson)",
    "cliente": "Por cliente (4 semanas)",
    "maestro": "Maestro (todas las series)",
    "destilado": "Alumno destilado",
    "apilado": "Alumno apilado",
    "robusta": "Combinación robusta (promedio de 6)",
}
ROBUST = ("actual", "suavizado", "tsb", "sba", "boosting", "cliente")
# Qué modelo se usa en cada lugar de la app (elegidos con validación + prueba).
CHOSEN = {"sugerencia": "robusta", "saca": "destilado", "semana": "apilado"}
STORED = ("actual", "robusta", "destilado", "apilado")


def _cubes(session: Session, products: list[Product]):
    """Unidades despachadas por (vendedor, producto, día) y por (cliente, producto, día)."""
    brasa = sorted(
        (p for p in products if p.category == ORDER_CATEGORY), key=lambda p: p.kg_per_unit
    )
    pos = {p.id: i for i, p in enumerate(brasa)}
    t = dispatch_orders.c
    rows = session.execute(
        select(
            t.seller, t.customer, t.delivery_date, t.material, t.ordered_kg, t.ordered_units,
            t.dispatched_kg, t.dispatched_units,
        ).where(func.upper(t.material).startswith(ORDER_MATERIAL_PREFIX, autoescape=True))
    ).all()  # fmt: skip
    lines = []
    for seller, customer, day, *rest in rows:
        product = product_for(OrderLine(day, *rest), brasa)
        if product is None:
            continue
        units = rest[4] or rest[3] / product.kg_per_unit  # despachado (o kg / peso)
        if units <= 0 or units >= 20000:
            continue
        lines.append(((seller or UNASSIGNED).lower(), customer, day, pos[product.id], units))
    if not lines:
        return None
    first, last = min(x[2] for x in lines), max(x[2] for x in lines)
    days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    at = {d: i for i, d in enumerate(days)}
    active = defaultdict(set)
    for s, _, d, _, _ in lines:
        active[s].add(d)
    every = sorted(active)
    core_sellers = [s for s in every if s != UNASSIGNED.lower() and len(active[s]) >= MIN_DAYS]
    YA = np.zeros((len(every), len(brasa), len(days)))
    for s, _, d, p, u in lines:
        YA[every.index(s), p, at[d]] += u
    # Clientes de los vendedores principales (su vendedor más frecuente).
    owner_count = defaultdict(lambda: defaultdict(int))
    for s, c, *_ in lines:
        if s in core_sellers:
            owner_count[c][s] += 1
    customers = sorted(owner_count)
    C = np.zeros((len(customers), len(brasa), len(days)))
    cidx = {c: i for i, c in enumerate(customers)}
    for s, c, d, p, u in lines:
        if c in cidx and s in core_sellers:
            C[cidx[c], p, at[d]] += u
    owner = np.array(
        [core_sellers.index(max(owner_count[c], key=owner_count[c].get)) for c in customers]
    )
    idx = np.array([every.index(s) for s in core_sellers])
    return YA, idx, core_sellers, days, C, owner, brasa


def train(session: Session, products: list[Product]) -> dict | None:
    """Entrena, mide y guarda. Devuelve el resumen (None si no hay historia suficiente)."""
    cubes = _cubes(session, products)
    if cubes is None:
        return None
    YA, idx, sellers, days, C, owner, brasa = cubes
    Y = YA[idx]
    S, P, N = Y.shape
    usable = list(range(core.FIRST, N))
    if len(usable) < 60 or not S:
        return None
    a, b = int(len(usable) * 0.70), int(len(usable) * 0.85)
    train_d, val_d, test_d = usable[:a], usable[a:b], usable[b:]

    XA = {d: core.features(YA, days, d) for d in usable}
    XC = {d: XA[d].reshape(YA.shape[0], P, -1)[idx].reshape(S * P, -1) for d in usable}
    yc = {d: Y[:, :, d].ravel() for d in usable}
    ya = {d: YA[:, :, d].ravel() for d in usable}
    stack = lambda D, ds: np.vstack([D[d] for d in ds])  # noqa: E731
    cat = lambda D, ds: np.concatenate([D[d] for d in ds])  # noqa: E731
    cust = core.by_customer(C, owner, S)

    def boosting_models(train_part):
        student = core.fit(stack(XC, train_part), cat(yc, train_part))
        teacher = core.fit(stack(XA, train_part), cat(ya, train_part))
        soft = 0.5 * cat(yc, train_part) + 0.5 * teacher.predict(stack(XC, train_part)).clip(min=0)
        distilled = core.fit(stack(XC, train_part), soft)
        oof = {}
        for block in np.array_split(np.array(train_part), 4):
            tm = core.fit(
                stack(XA, [d for d in train_part if d not in set(block)]),
                cat(ya, [d for d in train_part if d not in set(block)]),
            )
            for d in block:
                oof[d] = tm.predict(XC[d]).clip(min=0)
        xs = lambda d, tp: np.column_stack([XC[d], tp])  # noqa: E731
        stacked = core.fit(np.vstack([xs(d, oof[d]) for d in train_part]), cat(yc, train_part))

        def pred(model, d, extra=None):
            X = XC[d] if extra is None else xs(d, extra)
            return model.predict(X).reshape(S, P).clip(min=0)

        return {
            "boosting": lambda d: pred(student, d),
            "maestro": lambda d: teacher.predict(XC[d]).reshape(S, P).clip(min=0),
            "destilado": lambda d: pred(distilled, d),
            "apilado": lambda d: pred(stacked, d, teacher.predict(XC[d]).clip(min=0)),
        }

    simple = {
        "actual": lambda d: core.median4(Y, d),
        "suavizado": lambda d: core.ewma(Y, d),
        "tsb": lambda d: core.croston(Y, d, "tsb"),
        "sba": lambda d: core.croston(Y, d, "sba"),
        "cliente": lambda d: cust(Y, d),
    }
    preds: dict[str, dict[int, np.ndarray]] = defaultdict(dict)
    for part, train_part in ((val_d, train_d), (test_d, train_d + val_d)):
        fns = {**simple, **boosting_models(train_part)}
        for d in part:
            for k, f in fns.items():
                preds[k][d] = np.clip(f(d), 0, None)
            preds["robusta"][d] = np.mean([preds[k][d] for k in ROBUST], axis=0)

    # Pronóstico de los 2 días siguientes al último dato, con los modelos entrenados con todo.
    future = [N, N + 1]
    days = [*days, days[-1] + timedelta(days=1), days[-1] + timedelta(days=2)]
    for d in future:
        XA[d] = core.features(YA, days, d)
        XC[d] = XA[d].reshape(YA.shape[0], P, -1)[idx].reshape(S * P, -1)
    fns = {**simple, **boosting_models(usable)}
    for d in future:
        for k, f in fns.items():
            preds[k][d] = np.clip(f(d), 0, None)
        preds["robusta"][d] = np.mean([preds[k][d] for k in ROBUST], axis=0)

    evaluated = val_d + test_d
    A = Y[:, :, evaluated]
    metrics = {k: core.wape(np.stack([preds[k][d] for d in evaluated], axis=2), A) for k in MODELS}
    summary = {
        "trained_at": datetime.now(UTC).isoformat(),
        "data_from": days[0].isoformat(),
        "data_to": days[N - 1].isoformat(),
        "forecast_dates": [days[d].isoformat() for d in future],
        "split": {
            name: [days[part[0]].isoformat(), days[part[-1]].isoformat(), len(part)]
            for name, part in (
                ("entrenamiento", train_d),
                ("validacion", val_d),
                ("prueba", test_d),
            )
        },
        "sellers": sellers,
        "series_teacher": int(YA.shape[0]),
        "models": [{"key": k, "name": n, "metrics": metrics[k]} for k, n in MODELS.items()],
        "chosen": CHOSEN,
        "series": [
            {
                "date": days[d].isoformat(),
                "real": float(Y[:, :, d].sum()),
                **{k: float(preds[k][d].sum()) for k in STORED},
            }
            for d in evaluated
        ],
    }
    _save(session, summary, preds, evaluated + future, days, sellers, brasa)
    logger.info(
        "Modelo de demanda entrenado: %d vendedores, %s a %s",
        S, summary["data_from"], summary["data_to"],
    )  # fmt: skip
    return summary


def _save(session, summary, preds, evaluated, days, sellers, brasa) -> None:
    # Solo se conserva la última corrida: las predicciones son de los días evaluados.
    session.execute(delete(model_predictions))
    session.execute(delete(model_runs))
    session.execute(
        insert(model_runs).values(trained_at=datetime.now(UTC), summary=json.dumps(summary))
    )
    rows = []
    for k in STORED:
        for d in evaluated:
            for s, seller in enumerate(sellers):
                units = {
                    brasa[p].id: round(float(v))
                    for p, v in enumerate(preds[k][d][s])
                    if round(float(v)) > 0
                }
                if units:
                    rows.append(
                        {"model": k, "seller": seller, "date": days[d], "units": json.dumps(units)}
                    )
    if rows:
        session.execute(insert(model_predictions), rows)
    session.commit()


def latest(session: Session) -> dict | None:
    raw = session.scalar(select(model_runs.c.summary).order_by(model_runs.c.trained_at.desc()))
    return json.loads(raw) if raw else None


def stored_predictions(
    session: Session, model: str, date_from: date, date_to: date, seller: str | None
) -> list[tuple[str, date, dict[str, int]]]:
    t = model_predictions.c
    q = select(t.seller, t.date, t.units).where(
        t.model == model, t.date.between(date_from, date_to)
    )
    if seller:
        q = q.where(t.seller == seller.lower())
    return [(s, d, json.loads(u)) for s, d, u in session.execute(q)]
