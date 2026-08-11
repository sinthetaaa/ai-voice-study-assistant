from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)


ConceptDifficulty = Literal[
    "FOUNDATIONAL",
    "INTERMEDIATE",
    "ADVANCED",
]


class SourceChunk(BaseModel):
    id: str = Field(
        min_length=1,
    )

    text: str = Field(
        min_length=1,
    )

    document_name: str | None = None

    unit_label: str | None = None


class ConceptCandidate(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=120,
    )

    description: str = Field(
        min_length=10,
        max_length=800,
    )

    importance: int = Field(
        ge=1,
        le=5,
    )

    difficulty: ConceptDifficulty

    supporting_chunk_ids: list[str] = Field(
        min_length=1,
        max_length=100,
    )

    @field_validator("name")
    @classmethod
    def clean_name(
        cls,
        value: str,
    ) -> str:
        cleaned = (
            value
            .strip()
            .rstrip(".:;,")
        )

        if len(cleaned) < 2:
            raise ValueError(
                "Concept name cannot be empty",
            )

        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(
        cls,
        value: str,
    ) -> str:
        return value.strip()

    @field_validator(
        "supporting_chunk_ids",
    )
    @classmethod
    def clean_chunk_ids(
        cls,
        values: list[str],
    ) -> list[str]:
        cleaned = list(
            dict.fromkeys(
                value.strip()
                for value in values
                if value.strip()
            )
        )

        if not cleaned:
            raise ValueError(
                "At least one supporting chunk "
                "ID is required",
            )

        return cleaned


class ConceptExtractionRequest(BaseModel):
    chunks: list[SourceChunk] = Field(
        min_length=1,
        max_length=100,
    )


class ConceptExtractionResult(BaseModel):
    concepts: list[ConceptCandidate] = Field(
        max_length=100,
    )