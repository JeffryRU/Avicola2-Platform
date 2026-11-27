"""Servidor MCP (Model Context Protocol) para agentes de IA: plomería común (ADR 0017).

Autenticación con `Authorization: Bearer`, límite de llamadas por usuario y auditoría. Las
herramientas las registra cada módulo desde su adaptador de entrada MCP
(`planning/infrastructure/mcp`, `ingest/infrastructure/mcp`), sin lógica propia.
"""
