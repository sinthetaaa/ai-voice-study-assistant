from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)


EmbeddingInputType = Literal[
    "document",
    "query",
]


class EmbeddingRequest(BaseModel):
    texts: list[str] = Field(
        min_length=1,
        max_length=64,
    )

    input_type: EmbeddingInputType = (
        "document"
    )

    @field_validator("texts")
    @classmethod
    def validate_texts(
        cls,
        texts: list[str],
    ) -> list[str]:
        cleaned_texts = [
            text.strip()
            for text in texts
        ]

        if any(
            not text
            for text in cleaned_texts
        ):
            raise ValueError(
                "Embedding texts cannot be empty",
            )

        return cleaned_texts


class EmbeddingInfoResponse(BaseModel):
    provider: str
    model: str
    dimensions: int


class EmbeddingResponse(BaseModel):
    provider: str
    model: str
    dimensions: int
    count: int
    input_type: EmbeddingInputType

    embeddings: list[list[float]]