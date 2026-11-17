"""La saca en el formato de la API (lo usan la ruta y el programador que la guarda al cierre)."""

from app.planning.domain.saca import METHOD, SacaPlan
from app.planning.infrastructure.http import schemas as s


def saca_out(plan: SacaPlan) -> s.SacaOut:
    arrival = plan.arrival
    return s.SacaOut(
        date=plan.date,
        orders_date=plan.orders_date,
        projection_date=plan.projection_date,
        lines=[
            s.SacaLineOut(
                product_id=line.product.id,
                projected=line.projected,
                ordered=line.ordered,
                demand=line.balance,
                stock=line.stock,
                request=line.request,
                request_kg=line.request_kg,
                expected=arrival.expected.get(line.product.id, 0) if arrival else None,
                expected_a=arrival.expected_a.get(line.product.id, 0) if arrival else None,
            )
            for line in plan.lines
        ],
        projected=plan.projected,
        ordered=plan.ordered,
        demand=plan.balance,
        stock=plan.stock,
        plus=plan.plus,
        request=plan.request,
        request_kg=plan.request_kg,
        live_kg=plan.live_kg,
        yield_factor=plan.yield_factor,
        method=METHOD,
        farm_order=plan.farm_order,
        stock_b=plan.stock_b,
        stock_old=plan.stock_old,
        stock_lot_days=plan.stock_lot_days,
        groups=[
            s.SacaGroupOut(
                name=g.name,
                stock=g.stock,
                stock_b=g.stock_b,
                ordered=g.ordered,
                projected=g.projected,
                plus=g.plus,
                balance=g.balance,
                farm_order=g.farm_order,
                demand=g.balance,
                need=g.farm_order,
            )
            for g in plan.groups
        ],
        stock_date=plan.stock_date,
        sellers_registered=plan.sellers_registered,
        sellers_total=plan.sellers_total,
        orders_available=plan.orders_available,
        forecast=s.SacaForecastOut(
            method=arrival.model,
            days=arrival.days,
            date_from=arrival.date_from,
            date_to=arrival.date_to,
        )
        if arrival
        else None,
    )
