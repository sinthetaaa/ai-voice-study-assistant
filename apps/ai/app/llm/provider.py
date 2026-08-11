from abc import ABC, abstractmethod
from typing import Literal, TypeVar

from pydantic import BaseModel


StructuredResponseT = TypeVar(
    "StructuredResponseT",
    bound=BaseModel,
)


ChatRole = Literal[
    "system",
    "user",
    "assistant",
]


class LlmMessage(BaseModel):
    role: ChatRole
    content: str


class LlmProviderError(RuntimeError):
    pass


class LlmProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        raise NotImplementedError

    @property
    @abstractmethod
    def model_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    async def generate_structured(
        self,
        messages: list[LlmMessage],
        response_model: type[StructuredResponseT],
    ) -> StructuredResponseT:
        raise NotImplementedError