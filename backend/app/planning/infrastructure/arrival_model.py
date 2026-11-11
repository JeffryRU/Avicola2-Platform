"""Modelo de llegada por rango que se ajusta solo (ADR 0013).

Cada vez que cambia la historia de producción vuelve a competir un grupo de modelos sobre los
últimos días ya ocurridos (cada día se estima solo con los anteriores) y se usa el que menos
falló:

- Suavizado exponencial con distintas vidas medias: así se ajusta solo ese parámetro.
- Híbrido con peso de la parvada: el suavizado más una corrección aprendida con árboles
  (gradient boosting) a partir del peso vivo promedio de cada tipo. Solo compite cuando hay
  suficientes días con peso anotado.

No se guarda nada entrenado: con unos cientos de días el ajuste tarda poco y se repite con cada
dato nuevo. El resultado se recuerda mientras la historia no cambie.
"""

from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

from app.planning.domain.production import (
    CHECK_DAYS,
    HALF_LIFE_DAYS,
    MIN_HISTORY_DAYS,
    ArrivalCheck,
    ArrivalRates,
    DailyProduction,
    FittedArrival,
    arrival_rates,
    check_day,
    latest_weights,
    overall_error,
    usable_days,
)

# La de partida va primero: en un empate se queda.
HALF_LIVES = (HALF_LIFE_DAYS, 3.0, 14.0)
HYBRID = "hybrid_weight"
# Días ya ocurridos sobre los que compiten los modelos, e historia máxima que se usa.
SELECTION_DAYS = 28
MODEL_DAYS = 240
# El híbrido necesita esta cantidad de días con peso anotado, y se reentrena cada tantos días
# dentro de la comprobación (afuera, con cada dato nuevo).
MIN_WEIGHT_DAYS = 45
RETRAIN_EVERY = 7
MIN_TRAIN_ROWS = 30

# Lo costoso (hacer competir a los modelos) se recuerda mientras la historia no cambie.
_CACHE: OrderedDict[tuple, "_Evaluation | None"] = OrderedDict()
_CACHE_SIZE = 8


def ewma_name(half_life: float) -> str:
    return f"ewma_{half_life:g}"


class AdaptiveArrivalModel:
    def fit(
        self,
        history: list[DailyProduction],
        group_of: dict[str, str],
        weights: dict[str, float] | None = None,
        target: date | None = None,
    ) -> FittedArrival | None:
        """Elige y ajusta el modelo. `weights`: peso de la parvada del día a estimar, por tipo
        (lo que falte se toma del último anotado). `target`: el día a estimar."""
        days = usable_days(history)[-MODEL_DAYS:]
        if len(days) < MIN_HISTORY_DAYS:
            return None
        key = (
            tuple((d.date, d.recorded_at, tuple(sorted(d.weights.items()))) for d in days),
            tuple(sorted(group_of.items())),
        )
        if key not in _CACHE:
            _CACHE[key] = _evaluate(days, group_of)
            while len(_CACHE) > _CACHE_SIZE:
                _CACHE.popitem(last=False)
        _CACHE.move_to_end(key)
        found = _CACHE[key]
        if found is None:
            return None
        base, share, used = found.base, found.shares.get(found.best), {}
        if found.best == HYBRID and found.hybrid is not None:
            used = latest_weights(days) | {g: kg for g, kg in (weights or {}).items() if kg > 0}
            share = found.hybrid.predict(used, target or days[-1].date + timedelta(days=1))
        rates = ArrivalRates(
            share or base.share, base.b_rate, base.days, base.date_from, base.date_to
        )
        checks = found.checks.get(found.best, [])[-CHECK_DAYS:]
        return FittedArrival(rates, found.best, found.errors, checks, used)


@dataclass
class _Evaluation:
    base: ArrivalRates
    best: str
    errors: dict[str, float]
    checks: dict[str, list[ArrivalCheck]]
    shares: dict[str, dict[str, float]]
    hybrid: "_Hybrid | None"


def _evaluate(days: list[DailyProduction], group_of: dict[str, str]) -> _Evaluation | None:
    """Hace competir a los modelos sobre los últimos días ya ocurridos."""
    base = arrival_rates(days, group_of)
    if base is None:
        return None
    first = max(MIN_HISTORY_DAYS, len(days) - SELECTION_DAYS)
    checks: dict[str, list[ArrivalCheck]] = {}
    shares: dict[str, dict[str, float]] = {}
    for half_life in HALF_LIVES:
        name = ewma_name(half_life)
        checks[name] = []
        for index in range(first, len(days)):
            rates = arrival_rates(days[:index], group_of, half_life)
            if rates is not None:
                checks[name].append(check_day(days[index], group_of, rates.share))
        final = arrival_rates(days, group_of, half_life)
        shares[name] = final.share if final else base.share
    hybrid = _Hybrid(days, group_of)
    if hybrid.ready:
        checks[HYBRID] = hybrid.walk_forward(first)
    errors = {name: round(overall_error(found), 4) for name, found in checks.items() if found}
    best = min(errors, key=lambda name: errors[name]) if errors else ewma_name(HALF_LIFE_DAYS)
    return _Evaluation(base, best, errors, checks, shares, hybrid if hybrid.ready else None)


class _Hybrid:
    """Suavizado exponencial + corrección por árboles con el peso de la parvada de cada tipo."""

    def __init__(self, days: list[DailyProduction], group_of: dict[str, str]) -> None:
        self.days, self.group_of = days, group_of
        self.products = list(group_of)
        self.groups = list(dict.fromkeys(group_of.values()))
        self.start = MIN_HISTORY_DAYS
        self._final: tuple[list, np.ndarray] | None = None
        with_weight = sum(1 for d in days if d.weights)
        self.ready = with_weight >= MIN_WEIGHT_DAYS and len(days) - self.start >= MIN_TRAIN_ROWS + 1
        if not self.ready:
            return
        # Reparto real de cada día: aves que llegaron del producto por ave pedida de su tipo.
        self.actual = np.array([self._actual(d) for d in days])
        # Peso de cada tipo por día; si un día no se anotó, se arrastra el último conocido.
        self.kg = np.zeros((len(days), len(self.groups)))
        last = np.zeros(len(self.groups))
        for i, day in enumerate(days):
            for g, group in enumerate(self.groups):
                if day.weights.get(group):
                    last[g] = day.weights[group]
            self.kg[i] = last
        self.base = np.zeros((len(days), len(self.products)))
        self.x = np.zeros((len(days), self._width()))
        for i in range(self.start, len(days)):
            self.base[i] = self._base(i)
            self.x[i] = self._features(i, self.kg[i], days[i].date)

    def _actual(self, day: DailyProduction) -> list[float]:
        asked: dict[str, float] = {}
        produced: dict[str, float] = {}
        for line in day.lines:
            group = self.group_of.get(line.product_id)
            if group is not None:
                asked[group] = asked.get(group, 0.0) + line.ordered
                produced[line.product_id] = line.produced
        return [
            produced.get(p, 0.0) / asked[g] if asked.get(g) else 0.0
            for p, g in self.group_of.items()
        ]

    def _base(self, index: int) -> np.ndarray:
        rates = arrival_rates(self.days[:index], self.group_of)
        share = rates.share if rates else {}
        return np.array([share.get(p, 0.0) for p in self.products])

    def _width(self) -> int:
        return 2 * len(self.products) + 7 + len(self.groups)

    def _features(self, index: int, kg: np.ndarray, day: date) -> np.ndarray:
        """Reparto reciente (medias de 7 y 28 días), día de la semana y peso de cada tipo."""
        weekday = np.zeros(7)
        weekday[day.weekday()] = 1.0
        return np.concatenate(
            [
                self.actual[max(0, index - 7) : index].mean(axis=0),
                self.actual[max(0, index - 28) : index].mean(axis=0),
                weekday,
                kg,
            ]
        )

    def _train(self, until: int) -> list[HistGradientBoostingRegressor]:
        rows = slice(self.start, until)
        residual = self.actual[rows] - self.base[rows]
        return [
            HistGradientBoostingRegressor(
                max_iter=80, max_depth=2, learning_rate=0.05, random_state=0
            ).fit(self.x[rows], residual[:, k])
            for k in range(len(self.products))
        ]

    def _share(self, models: list, base: np.ndarray, x: np.ndarray) -> dict[str, float]:
        row = x.reshape(1, -1)
        return {
            p: float(max(0.0, base[k] + models[k].predict(row)[0]))
            for k, p in enumerate(self.products)
        }

    def walk_forward(self, first: int) -> list[ArrivalCheck]:
        checks: list[ArrivalCheck] = []
        models, fitted_at = None, 0
        for index in range(max(first, self.start + MIN_TRAIN_ROWS), len(self.days)):
            if models is None or index - fitted_at >= RETRAIN_EVERY:
                models, fitted_at = self._train(index), index
            share = self._share(models, self.base[index], self.x[index])
            checks.append(check_day(self.days[index], self.group_of, share))
        return checks

    def predict(self, weights: dict[str, float], target: date) -> dict[str, float]:
        n = len(self.days)
        if self._final is None:  # se entrena una vez con toda la historia
            self._final = (self._train(n), self._base(n))
        models, base = self._final
        kg = np.array([weights.get(g) or self.kg[-1][i] for i, g in enumerate(self.groups)])
        return self._share(models, base, self._features(n, kg, target))
