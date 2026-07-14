"""
Shared LLM client — Anthropic-first with OpenAI fallback.

Drop-in replacement for `OpenAI()`: exposes the same
`client.chat.completions.create()` interface so all agents work unchanged.

Priority:
  1. Anthropic Claude (ANTHROPIC_API_KEY) — preferred; no quota issues
  2. OpenAI (OPENAI_API_KEY) — fallback if Anthropic key absent

Model mapping:
  gpt-4o-mini  → claude-haiku-4-5-20251001
  gpt-4o       → claude-sonnet-5
  anything else → claude-haiku-4-5-20251001
"""

from __future__ import annotations
import os


# ---------------------------------------------------------------------------
# Anthropic-compatible shim classes (mimic openai.ChatCompletion response)
# ---------------------------------------------------------------------------

class _CompatMessage:
    def __init__(self, text: str) -> None:
        self.content = text
        self.role = "assistant"


class _CompatChoice:
    def __init__(self, text: str) -> None:
        self.message = _CompatMessage(text)
        self.finish_reason = "stop"


class _CompatResponse:
    def __init__(self, text: str) -> None:
        self.choices = [_CompatChoice(text)]


_MODEL_MAP: dict[str, str] = {
    "gpt-4o":            "claude-sonnet-5",
    "gpt-4-turbo":       "claude-sonnet-5",
    "gpt-4":             "claude-sonnet-5",
    "gpt-4o-mini":       "claude-haiku-4-5-20251001",
    "gpt-3.5-turbo":     "claude-haiku-4-5-20251001",
}
_DEFAULT_CLAUDE = "claude-haiku-4-5-20251001"


class _AnthropicCompletions:
    def create(
        self,
        model: str = "gpt-4o-mini",
        messages: list | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        response_format: dict | None = None,  # ignored — Claude follows JSON prompts
        **kwargs,
    ) -> _CompatResponse:
        import anthropic

        claude_model = _MODEL_MAP.get(model, _DEFAULT_CLAUDE)

        # Anthropic separates system messages from the conversation array
        system = ""
        user_messages: list[dict] = []
        for m in (messages or []):
            if m.get("role") == "system":
                system = m["content"]
            else:
                user_messages.append({"role": m["role"], "content": m["content"]})

        create_kwargs: dict = {
            "model": claude_model,
            "max_tokens": max_tokens or 1024,
            "temperature": temperature,
            "messages": user_messages,
        }
        if system:
            create_kwargs["system"] = system

        ac = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        result = ac.messages.create(**create_kwargs)
        return _CompatResponse(result.content[0].text)


class _AnthropicChat:
    def __init__(self) -> None:
        self.completions = _AnthropicCompletions()


class AnthropicCompatClient:
    """OpenAI-API-compatible client backed by Anthropic Claude."""

    def __init__(self, api_key: str | None = None) -> None:
        self.chat = _AnthropicChat()


# ---------------------------------------------------------------------------
# Public factory
# ---------------------------------------------------------------------------

def get_llm_client() -> AnthropicCompatClient | object:
    """
    Return an LLM client with a `client.chat.completions.create()` interface.
    Prefers Anthropic when ANTHROPIC_API_KEY is set; falls back to OpenAI.
    Raises ValueError if neither key is available.
    """
    if os.environ.get("ANTHROPIC_API_KEY"):
        return AnthropicCompatClient()

    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        from openai import OpenAI  # only import if actually needed
        return OpenAI(api_key=openai_key)

    raise ValueError(
        "No LLM API key found. Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY."
    )


def llm_available() -> bool:
    """True if any LLM key is configured."""
    return bool(
        os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY")
    )
