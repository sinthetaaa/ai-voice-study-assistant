import json
import os
from functools import lru_cache

import httpx
from pydantic import ValidationError

from .provider import (
    LlmMessage,
    LlmProvider,
    LlmProviderError,
    StructuredResponseT,
)


class OllamaLlmProvider(LlmProvider):
    PROVIDER_NAME = "ollama"

    DEFAULT_BASE_URL = "http://localhost:11434"
    DEFAULT_MODEL = "gemma4:e4b"

    MAX_STRUCTURED_ATTEMPTS = 2

    def __init__(self) -> None:
        self._base_url = os.getenv(
            "OLLAMA_BASE_URL",
            self.DEFAULT_BASE_URL,
        ).rstrip("/")

        self._model = os.getenv(
            "OLLAMA_MODEL",
            self.DEFAULT_MODEL,
        )

        self._timeout = httpx.Timeout(
            connect=10.0,
            read=600.0,
            write=60.0,
            pool=10.0,
        )

    @property
    def provider_name(self) -> str:
        return self.PROVIDER_NAME

    @property
    def model_name(self) -> str:
        return self._model

    async def generate_structured(
        self,
        messages: list[LlmMessage],
        response_model: type[StructuredResponseT],
    ) -> StructuredResponseT:
        if not messages:
            raise LlmProviderError(
                "At least one LLM message is required",
            )

        schema = response_model.model_json_schema()

        grounded_messages = self._build_grounded_messages(
            messages=messages,
            schema=schema,
        )

        last_error: Exception | None = None
        last_content: str | None = None

        for attempt in range(
            1,
            self.MAX_STRUCTURED_ATTEMPTS + 1,
        ):
            attempt_messages = list(
                grounded_messages,
            )

            if attempt > 1:
                attempt_messages.append(
                    {
                        "role": "system",
                        "content": (
                            "Your previous response did not produce "
                            "a valid JSON object matching the required "
                            "schema. Return ONLY one complete valid JSON "
                            "object matching the schema exactly. "
                            "Do not return plain text. "
                            "Do not use Markdown or code fences. "
                            "Do not include commentary outside the JSON."
                        ),
                    }
                )

            payload = await self._request_ollama(
                messages=attempt_messages,
                schema=schema,
            )

            try:
                content = self._extract_content(
                    payload,
                )

            except LlmProviderError as error:
                last_error = error

                if (
                    attempt
                    < self.MAX_STRUCTURED_ATTEMPTS
                ):
                    continue

                break

            last_content = content

            try:
                return (
                    response_model
                    .model_validate_json(
                        content,
                    )
                )

            except ValidationError as error:
                last_error = error

                if (
                    attempt
                    < self.MAX_STRUCTURED_ATTEMPTS
                ):
                    continue

                break

        raise LlmProviderError(
            "Ollama failed to return valid structured "
            f"output after "
            f"{self.MAX_STRUCTURED_ATTEMPTS} attempts. "
            f"Last content: {last_content!r}. "
            f"Last error: {last_error}"
        )

    def _build_grounded_messages(
        self,
        messages: list[LlmMessage],
        schema: dict,
    ) -> list[dict[str, str]]:
        schema_text = json.dumps(
            schema,
            ensure_ascii=False,
        )

        schema_instruction = {
            "role": "system",
            "content": (
                "You must return ONLY valid JSON matching "
                "the provided JSON Schema exactly. "
                "Do not include Markdown, code fences, "
                "commentary, or text outside the JSON object."
                "\n\n"
                "JSON Schema:\n"
                f"{schema_text}"
            ),
        }

        return [
            schema_instruction,
            *[
                message.model_dump()
                for message in messages
            ],
        ]

    async def _request_ollama(
        self,
        messages: list[dict[str, str]],
        schema: dict,
    ) -> dict:
        request_body = {
            "model": self._model,

            "stream": False,

            "think": False,

            "format": schema,

            "messages": messages,

            "options": {
                "temperature": 0,
                "seed": 42,
                "num_ctx": 8192,
            },
        }

        try:
            async with httpx.AsyncClient(
                timeout=self._timeout,
            ) as client:
                response = await client.post(
                    f"{self._base_url}/api/chat",
                    json=request_body,
                )

                response.raise_for_status()

        except httpx.TimeoutException as error:
            error_name = type(error).__name__

            error_detail = (
                str(error).strip()
                or repr(error)
            )

            raise LlmProviderError(
                "Ollama request timed out at "
                f"{self._base_url}. "
                f"{error_name}: "
                f"{error_detail}"
            ) from error

        except httpx.HTTPError as error:
            error_name = type(error).__name__

            error_detail = (
                str(error).strip()
                or repr(error)
            )

            raise LlmProviderError(
                "Failed to communicate with "
                f"Ollama at {self._base_url}. "
                f"{error_name}: "
                f"{error_detail}"
            ) from error

        try:
            payload = response.json()

        except ValueError as error:
            raise LlmProviderError(
                "Ollama returned invalid HTTP JSON",
            ) from error

        if not isinstance(payload, dict):
            raise LlmProviderError(
                "Ollama returned an unexpected "
                "response payload",
            )

        return payload

    @staticmethod
    def _extract_content(
        payload: dict,
    ) -> str:
        message = payload.get(
            "message",
        )

        if not isinstance(
            message,
            dict,
        ):
            raise LlmProviderError(
                "Ollama response did not contain "
                "a message object",
            )

        content = message.get(
            "content",
        )

        if (
            not isinstance(
                content,
                str,
            )
            or not content.strip()
        ):
            thinking = message.get(
                "thinking",
            )

            thinking_length = (
                len(thinking)
                if isinstance(
                    thinking,
                    str,
                )
                else 0
            )

            raise LlmProviderError(
                "Ollama returned empty structured content. "
                f"done_reason="
                f"{payload.get('done_reason')!r}, "
                f"prompt_eval_count="
                f"{payload.get('prompt_eval_count')!r}, "
                f"eval_count="
                f"{payload.get('eval_count')!r}, "
                f"thinking_length="
                f"{thinking_length}"
            )

        return content.strip()


@lru_cache(maxsize=1)
def get_llm_provider() -> LlmProvider:
    return OllamaLlmProvider()