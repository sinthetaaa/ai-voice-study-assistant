from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)


QuestionType = Literal[
    "RECALL",
    "UNDERSTANDING",
    "APPLICATION",
]


QuestionDifficulty = Literal[
    "EASY",
    "MEDIUM",
    "HARD",
]


ConceptDifficulty = Literal[
    "FOUNDATIONAL",
    "INTERMEDIATE",
    "ADVANCED",
]


class QuestionSourceChunk(BaseModel):
    id: str = Field(
        min_length=1,
    )

    text: str = Field(
        min_length=1,
        max_length=6000,
    )

    document_name: str | None = Field(
        default=None,
        max_length=255,
    )

    unit_label: str | None = Field(
        default=None,
        max_length=255,
    )

    @field_validator("id")
    @classmethod
    def clean_id(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError(
                "Source chunk ID cannot be empty",
            )

        return cleaned

    @field_validator("text")
    @classmethod
    def clean_text(
        cls,
        value: str,
    ) -> str:
        cleaned = " ".join(
            value.split(),
        )

        if not cleaned:
            raise ValueError(
                "Source chunk text cannot be empty",
            )

        return cleaned


class QuestionConcept(BaseModel):
    id: str = Field(
        min_length=1,
    )

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

    source_chunks: list[
        QuestionSourceChunk
    ] = Field(
        min_length=1,
        max_length=30,
    )

    @field_validator("id")
    @classmethod
    def clean_id(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError(
                "Concept ID cannot be empty",
            )

        return cleaned

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
        cleaned = " ".join(
            value.split(),
        )

        if len(cleaned) < 10:
            raise ValueError(
                "Concept description is too short",
            )

        return cleaned

    @field_validator("source_chunks")
    @classmethod
    def unique_source_chunks(
        cls,
        chunks: list[
            QuestionSourceChunk
        ],
    ) -> list[
        QuestionSourceChunk
    ]:
        seen: set[str] = set()

        unique_chunks: list[
            QuestionSourceChunk
        ] = []

        for chunk in chunks:
            if chunk.id in seen:
                continue

            seen.add(chunk.id)

            unique_chunks.append(chunk)

        if not unique_chunks:
            raise ValueError(
                "At least one source chunk "
                "is required",
            )

        return unique_chunks


class QuestionGenerationRequest(BaseModel):
    concept: QuestionConcept

    requested_types: list[
        QuestionType
    ] = Field(
        default_factory=lambda: [
            "RECALL",
            "UNDERSTANDING",
            "APPLICATION",
        ],
        min_length=1,
        max_length=3,
    )

    @field_validator("requested_types")
    @classmethod
    def unique_requested_types(
        cls,
        values: list[
            QuestionType
        ],
    ) -> list[
        QuestionType
    ]:
        return list(
            dict.fromkeys(values)
        )


class GeneratedQuestion(BaseModel):
    type: QuestionType

    difficulty: QuestionDifficulty

    prompt: str = Field(
        min_length=10,
        max_length=1000,
    )

    expected_answer: str = Field(
        min_length=20,
        max_length=3000,
    )

    evidence_chunk_ids: list[str] = Field(
        min_length=1,
        max_length=5,
    )

    @field_validator("prompt")
    @classmethod
    def clean_prompt(
        cls,
        value: str,
    ) -> str:
        cleaned = " ".join(
            value.split(),
        )

        if len(cleaned) < 10:
            raise ValueError(
                "Question prompt is too short",
            )

        return cleaned

    @field_validator("expected_answer")
    @classmethod
    def clean_expected_answer(
        cls,
        value: str,
    ) -> str:
        cleaned = " ".join(
            value.split(),
        )

        if len(cleaned) < 20:
            raise ValueError(
                "Expected answer is too short",
            )

        return cleaned

    @field_validator(
        "evidence_chunk_ids",
    )
    @classmethod
    def clean_evidence_ids(
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
                "At least one evidence chunk "
                "ID is required",
            )

        return cleaned


class QuestionGenerationResult(BaseModel):
    concept_id: str = Field(
        min_length=1,
    )

    questions: list[
        GeneratedQuestion
    ] = Field(
        default_factory=list,
        max_length=3,
    )

    @field_validator("concept_id")
    @classmethod
    def clean_concept_id(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError(
                "Concept ID cannot be empty",
            )

        return cleaned