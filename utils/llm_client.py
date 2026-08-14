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


def _anthropic_durable_failure_reason(exc: Exception) -> str | None:
    """
    Classify whether an Anthropic failure is durable for the rest of this
    process (out of credit, bad/revoked key, no permission) vs transient
    (rate limit, timeout, connection blip, server overload) — the latter
    genuinely might succeed on the next call, the former never will without
    a human topping up billing or fixing the key. Returns a short reason
    string if durable, else None.
    """
    try:
        import anthropic
    except ImportError:
        return None

    if isinstance(exc, anthropic.AuthenticationError):
        return "authentication failed — check ANTHROPIC_API_KEY"
    if isinstance(exc, anthropic.PermissionDeniedError):
        return "permission denied on Anthropic account"
    if isinstance(exc, anthropic.BadRequestError) and "credit balance" in str(exc).lower():
        return "credit balance too low"
    return None


class _FallbackCompletions:
    """Tries Anthropic first; on ANY failure (no credit, rate limit, auth,
    connection — anything), retries the identical call against OpenAI instead.
    Only used in auto mode when both keys are present. A failed call never
    raises to the caller unless OpenAI also fails.

    Once a call fails for a DURABLE reason (out of credit, bad key, no
    permission), Anthropic is skipped entirely for the rest of this process —
    those conditions won't resolve mid-run, so retrying every subsequent call
    just adds latency and log noise. Transient failures (rate limits,
    timeouts, connection blips) don't trip this — Anthropic keeps getting
    retried per-call since those can genuinely recover.
    """

    # Process-wide, not per-instance: every agent in a pipeline run creates
    # its own client, but they should all learn about a durable outage once.
    _unavailable_reason: str | None = None

    def __init__(self, openai_key: str) -> None:
        self._anthropic = _AnthropicCompletions()
        self._openai_key = openai_key

    def create(self, **kwargs) -> _CompatResponse:
        import logging
        logger = logging.getLogger(__name__)

        if _FallbackCompletions._unavailable_reason is not None:
            return _openai_client(self._openai_key).chat.completions.create(**kwargs)

        try:
            return self._anthropic.create(**kwargs)
        except Exception as exc:
            durable_reason = _anthropic_durable_failure_reason(exc)
            if durable_reason:
                _FallbackCompletions._unavailable_reason = durable_reason
                logger.critical(
                    "Anthropic unavailable for the rest of this run (%s) — every "
                    "remaining call in this pipeline run will go straight to OpenAI. "
                    "Fix this before the next scheduled run to restore Anthropic usage.",
                    durable_reason,
                )
            else:
                logger.warning(
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


def anthropic_status() -> str | None:
    """
    None if Anthropic is fine (or hasn't failed yet this run). Otherwise the
    durable failure reason recorded by the fallback client — e.g. "credit
    balance too low". Lets callers (e.g. the end-of-run pipeline summary)
    surface a persistent "running on OpenAI only" notice instead of it being
    buried in per-call log lines.
    """
    return _FallbackCompletions._unavailable_reason
