"""El agente del asistente de la app: el workflow 07_asistente_app de n8n (ADR 0022).

Se le manda la pregunta por su webhook, con el secreto en `X-Assistant-Token`, y responde
`{"reply": "..."}` (o `{"output": "..."}`, la salida del AI Agent tal cual).
"""

import json
import urllib.request
from pathlib import Path

import yaml

from app.planning.application.ports import AssistantRequest
from app.planning.domain.assistant import GuardrailRule, StarterGroup, guardrail_rule
from app.planning.domain.permissions import Permission

STARTERS_FILE = "assistant.yaml"


class N8nAssistant:
    def __init__(self, url: str, token: str, timeout_seconds: int) -> None:
        self.url, self.token, self.timeout = url, token, timeout_seconds

    def ask(self, request: AssistantRequest) -> str:
        body = json.dumps(
            {
                "message": request.message,
                "conversation": request.conversation,
                "ticket": request.ticket,
                "user": {
                    "username": request.username,
                    "name": request.name,
                    "role": request.role,
                    "permissions": list(request.permissions),
                    "scope": request.scope,
                },
            },
            ensure_ascii=False,
        ).encode()
        http = urllib.request.Request(  # noqa: S310 (URL de la configuración, no del usuario)
            self.url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", "X-Assistant-Token": self.token},
        )
        with urllib.request.urlopen(http, timeout=self.timeout) as response:  # noqa: S310
            data = json.loads(response.read().decode() or "{}")
        if isinstance(data, list) and data:
            data = data[0]
        text = data.get("reply") or data.get("output") if isinstance(data, dict) else None
        if not isinstance(text, str):
            raise ValueError("El agente respondió sin texto.")
        return text


def _read(config_dir: Path) -> dict:
    path = config_dir / STARTERS_FILE
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def load_guardrails(config_dir: Path) -> list[GuardrailRule]:
    """Preguntas que no llegan al agente (config/assistant.yaml, `guardrails`)."""
    return [
        guardrail_rule(str(g["categoria"]), [str(p) for p in g["patrones"]], str(g["respuesta"]))
        for g in _read(config_dir).get("guardrails", [])
    ]


def load_starters(config_dir: Path) -> list[StarterGroup]:
    """Preguntas sugeridas por rol (config/assistant.yaml)."""
    raw = _read(config_dir)
    groups = []
    for g in raw.get("preguntas_de_inicio", []):
        permission = g.get("permiso")
        groups.append(
            StarterGroup(
                questions=tuple(str(q) for q in g.get("preguntas", [])),
                permission=Permission(permission) if permission else None,
                sellers=bool(g.get("solo_vendedores", False)),
                scope=str(g.get("alcance", "")),
                topics=tuple(str(t) for t in g.get("temas", [])),
            )
        )
    return groups
