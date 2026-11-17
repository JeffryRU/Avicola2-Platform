"""Preferencias de la interfaz de cada cuenta (tema, color principal, accesibilidad).

El backend las guarda tal como las manda la app, sin conocer cada opción: esa lista vive en el
frontend, que valida lo que lee y descarta lo que no reconoce. Así, una opción nueva no exige
cambiar el backend. Aquí solo se acota la forma: un objeto pequeño, de claves cortas y valores
simples (texto corto, sí/no o vacío), con a lo sumo un nivel de objetos anidados.
"""

from app.shared.domain.errors import DomainError

Preferences = dict[str, object]

MAX_KEYS = 40
MAX_KEY = 40
MAX_TEXT = 40
MAX_DEPTH = 1


def check_preferences(prefs: object) -> Preferences:
    """Devuelve las preferencias si tienen una forma válida; si no, lanza DomainError."""
    if not isinstance(prefs, dict):
        raise DomainError("Las preferencias deben ser un objeto.")
    _check_object(prefs, depth=0)
    return prefs


def _check_object(obj: dict, depth: int) -> None:
    if len(obj) > MAX_KEYS:
        raise DomainError("Hay demasiadas preferencias.")
    for key, value in obj.items():
        if not isinstance(key, str) or not 1 <= len(key) <= MAX_KEY:
            raise DomainError("Hay una preferencia con un nombre no válido.")
        if isinstance(value, dict):
            if depth >= MAX_DEPTH:
                raise DomainError("Las preferencias admiten un solo nivel de grupos.")
            _check_object(value, depth + 1)
        elif isinstance(value, str):
            if len(value) > MAX_TEXT:
                raise DomainError(f"La preferencia «{key}» es demasiado larga.")
        elif not (value is None or isinstance(value, bool)):
            raise DomainError(f"La preferencia «{key}» tiene un valor no válido.")
