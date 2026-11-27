"""El agente del asistente de la app: el workflow 07_asistente_app de n8n (ADR 0022).

Se le manda la pregunta por su webhook, con el secreto en `X-Assistant-Token`, y responde
`{"reply": "..."}` (o `{"output": "..."}`, la salida del AI Agent tal cual).
"""

import json
import urllib.request
from collections.abc import Iterator
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
        """La respuesta entera (Telegram, WhatsApp y la API sin streaming). El workflow puede
        responder en partes o de una vez: se leen igual que en `ask_stream`."""
        return "".join(self.ask_stream(request))

    def ask_stream(self, request: AssistantRequest) -> Iterator[str]:
        """La respuesta en partes: el webhook de n8n en modo «Streaming» manda una línea JSON por
        evento (`begin`, `item` con el texto, `end`, `error`). Si el workflow aún responde de una
        vez (un solo JSON), se entrega todo junto."""
        with urllib.request.urlopen(self._http(request), timeout=self.timeout) as response:  # noqa: S310
            rest: list[str] = []
            for raw in response:
                line = raw.decode().strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except ValueError:
                    rest.append(line)
                    continue
                kind = event.get("type") if isinstance(event, dict) else None
                if kind == "item" and isinstance(event.get("content"), str):
                    yield event["content"]
                elif kind == "error":
                    raise ValueError("El agente falló a mitad de la respuesta.")
                elif kind not in ("begin", "end"):
                    rest.append(line)
            if rest:
                # Sin streaming: el cuerpo es la respuesta entera (JSON de «Respond to Webhook»).
                yield _reply_of(json.loads("".join(rest)))

    def _http(self, request: AssistantRequest) -> urllib.request.Request:
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
                "history": [{"role": role, "text": text} for role, text in request.history],
                # El flujo 07 lee la memoria como texto, una línea por mensaje.
                "history_text": _history_text(request.history),
                "channel": request.channel,
            },
            ensure_ascii=False,
        ).encode()
        return urllib.request.Request(  # noqa: S310 (URL de la configuración, no del usuario)
            self.url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", "X-Assistant-Token": self.token},
        )


def _history_text(history: tuple[tuple[str, str], ...]) -> str:
    return "\n".join(
        ("Persona: " if role == "user" else "Asistente: ") + text for role, text in history
    )


def _reply_of(data: object) -> str:
    """El texto de la respuesta del agente (`reply` u `output`, también dentro de una lista)."""
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
