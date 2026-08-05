"""
Shared LLM client — switchable between Anthropic Claude and OpenAI.

Drop-in replacement for `OpenAI()`: exposes the same
`client.chat.completions.create()` interface so all agents work unchanged.

Provider selection (set LLM_PROVIDER to switch — no code changes needed):
  LLM_PROVIDER=openai     → force OpenAI only (requires OPENAI_API_KEY)
  LLM_PROVIDER=anthropic  → force Anthropic only (requires ANTHROPIC_API_KEY)
  unset (both keys present) → auto: try Anthropic first on every call; if that
                               call errors for any reason (no credit, rate
                               limit, auth, connection), transparently retry
                               the SAME call on OpenAI instead. This is a
                               live per-call fallback, not a one-time choice
                               made at startup — so it keeps using Anthropic
                               as long as it keeps working, and only spills
                               over to OpenAI for the calls that actually fail.
  unset (one key present)   → use whichever key is set

Model mapping (Anthropic path only — OpenAI path uses the model name as-is):
  gpt-4o-mini  → claude-haiku-4-5-20251001
  gpt-4o       → claude-sonnet-5
  anything else → claude-haiku-4-5-20251001
"""

from __future__ import annotations
import os
import re


def _strip_json_fence(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` markdown fences Claude sometimes adds.
    Also handles fences that don't close cleanly (truncated response)."""
    text = text.strip()
    # Closed fence: ```json\n...\n```
    match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Unclosed fence (truncated): ```json\n...  — take everything after opening line
    match = re.match(r"^```(?:json)?\s*\n(.*)", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


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
        max_tokens: int = 4096,
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
        text = result.content[0].text
        # Claude sometimes wraps JSON in ```json fences despite being told not to.
        # Strip them so agents can json.loads() directly without crashing.
        if response_format and response_format.get("type") == "json_object":
            text = _strip_json_fence(text)
        return _CompatResponse(text)


class _AnthropicChat:
    def __init__(self) -> None:
        self.completions = _AnthropicCompletions()


class AnthropicCompatClient:
    """OpenAI-API-compatible client backed by Anthropic Claude."""

    def __init__(self, api_key: str | None = None) -> None:
        self.chat = _AnthropicChat()


class _FallbackCompletions:
    """Tries Anthropic first; on ANY failure (no credit, rate limit, auth,
    connection — anything), retries the identical call against OpenAI instead.
    Only used in auto mode when both keys are present. A failed call never
    raises to the caller unless OpenAI also fails."""

    def __init__(self, openai_key: str) -> None:
        self._anthropic = _AnthropicCompletions()
        self._openai_key = openai_key

    def create(self, **kwargs) -> _CompatResponse:
        try:
            return self._anthropic.create(**kwargs)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "Anthropic call failed (%s) — falling back to OpenAI for this request",
                exc,
            )
            return _openai_client(self._openai_key).chat.completions.create(**kwargs)


class _FallbackChat:
    def __init__(self, openai_key: str) -> None:
        self.completions = _FallbackCompletions(openai_key)


class FallbackCompatClient:
    """Tries Anthropic per-call, transparently falling back to OpenAI whenever
    an individual Anthropic call fails (e.g. out of credit)."""

    def __init__(self, openai_key: str) -> None:
        self.chat = _FallbackChat(openai_key)


# ---------------------------------------------------------------------------
# Public factory
# ---------------------------------------------------------------------------

def _openai_client(key: str):
    from openai import OpenAI  # only import if actually needed
    return OpenAI(api_key=key)


def get_llm_client() -> AnthropicCompatClient | FallbackCompatClient | object:
    """
    Return an LLM client with a `client.chat.completions.create()` interface.

    LLM_PROVIDER env var hard-forces a specific provider ("openai" or
    "anthropic") — no fallback, used when you want to pin to one provider on
    purpose. Left unset with both keys present, every call tries Anthropic
    first and falls back to OpenAI automatically if that specific call fails
    (e.g. Anthropic credit runs out mid-day) — see FallbackCompatClient.
    Raises ValueError if the selected provider's key is missing.
    """
    provider = os.environ.get("LLM_PROVIDER", "").strip().lower()

    if provider == "openai":
        openai_key = os.environ.get("OPENAI_API_KEY")
        if not openai_key:
            raise ValueError("LLM_PROVIDER=openai but OPENAI_API_KEY is not set.")
        return _openai_client(openai_key)

    if provider == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise ValueError("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.")
        return AnthropicCompatClient()

    # Auto (LLM_PROVIDER unset): try Anthropic per-call, fall back to OpenAI
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    if anthropic_key and openai_key:
        return FallbackCompatClient(openai_key)
    if anthropic_key:
        return AnthropicCompatClient()
    if openai_key:
        return _openai_client(openai_key)

    raise ValueError(
        "No LLM API key found. Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY."
    )


def llm_available() -> bool:
    """True if any LLM key is configured."""
    return bool(
        os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY")
    )
