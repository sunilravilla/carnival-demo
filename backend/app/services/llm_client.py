"""
LLM Client backed by the Anthropic SDK (claude-sonnet-4-5 default).
Keeps the same public interface as the former OpenAI-compatible client so
nothing else in the codebase needs to change.
"""

import json
import os
import re
from typing import AsyncGenerator, Optional, Dict, Any, List

from anthropic import Anthropic, AsyncAnthropic


class LLMClient:
    """Anthropic-backed LLM client with the same interface as the former vLLM client."""

    def __init__(self, api_key: str, model: str):
        self._client = Anthropic(api_key=api_key)
        self._async_client = AsyncAnthropic(api_key=api_key)
        self.model = model

    def generate(
        self,
        prompt: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        messages = [{"role": "user", "content": prompt}]
        return self.chat_completion(messages, max_tokens, temperature, **kwargs)

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 500,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        # Anthropic takes system as a top-level param, not inside messages list.
        system_parts: List[str] = []
        filtered: List[Dict[str, str]] = []
        for m in messages:
            if m.get("role") == "system":
                system_parts.append(m["content"])
            else:
                filtered.append(m)

        create_kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": filtered or [{"role": "user", "content": "Hello"}],
        }
        if system_parts:
            system_text = "\n\n".join(system_parts)
            create_kwargs["system"] = [
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        # Anthropic doesn't accept response_format — drop it silently.
        kwargs.pop("response_format", None)

        response = self._client.messages.create(**create_kwargs)
        return response.content[0].text

    def chat_completion_json(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 800,
        temperature: float = 0.0,
        **kwargs,
    ) -> Dict[str, Any]:
        """Call chat_completion and parse the response as JSON.

        Sonnet reliably emits valid JSON when instructed. The gpt-oss
        fallback paths (regex extraction, harmony channel) are not needed.
        """
        raw = self.chat_completion(messages, max_tokens=max_tokens, temperature=temperature)
        cleaned = raw.strip()

        fence_match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
        if fence_match:
            cleaned = fence_match.group(1).strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            brace_matches = re.findall(r"\{[\s\S]*?\}", cleaned)
            for candidate in sorted(brace_matches, key=len, reverse=True):
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    continue

        return {"tool": None, "args": {}, "say": raw}


    async def chat_completion_stream(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 350,
        temperature: float = 0.4,
    ) -> AsyncGenerator[str, None]:
        """Async generator yielding text chunks for streaming responses."""
        system_parts: List[str] = []
        filtered: List[Dict[str, str]] = []
        for m in messages:
            if m.get("role") == "system":
                system_parts.append(m["content"])
            else:
                filtered.append(m)

        create_kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": filtered or [{"role": "user", "content": "Hello"}],
        }
        if system_parts:
            create_kwargs["system"] = [
                {
                    "type": "text",
                    "text": "\n\n".join(system_parts),
                    "cache_control": {"type": "ephemeral"},
                }
            ]

        async with self._async_client.messages.stream(**create_kwargs) as stream:
            async for text in stream.text_stream:
                yield text


def create_client_from_env() -> LLMClient:
    """Create an LLM client from environment variables."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")

    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required")

    return LLMClient(api_key=api_key, model=model)
