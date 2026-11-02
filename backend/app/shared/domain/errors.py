"""Errores de dominio compartidos. Los adaptadores HTTP los traducen a códigos de estado."""


class DomainError(Exception):
    """Regla de negocio incumplida (datos inválidos)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    """El recurso pedido no existe."""


class AuthenticationError(DomainError):
    """Credenciales o token inválidos."""


class ForbiddenError(DomainError):
    """El usuario está identificado pero no tiene permiso para la operación."""


class ConflictError(DomainError):
    """La operación choca con el estado actual del recurso."""
