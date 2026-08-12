from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)

from app.questions.models import (
    QuestionType,
)


RemediationKind = Literal[
    "MISCONCEPTION",
    "MISSING_POINTS",
    "GENERAL_GAP",
]

EvaluationCorrectness = Literal[
    "CORRECT",
    "PARTIAL",
    "INCORRECT",
]


class RemediationEvidenceChunk(
    BaseModel,
):
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
                "Evidence chunk ID cannot be empty",
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
                "Evidence text cannot be empty",
            )

        return cleaned


class RemediationGenerationRequest(
    BaseModel,
):
    evaluation_id: str = Field(
        min_length=1,
    )

    concept_name: str = Field(
        min_length=2,
        max_length=160,
    )

    question_id: str = Field(
        min_length=1,
    )

    question_type: QuestionType

    question_prompt: str = Field(
        min_length=10,
        max_length=2000,
    )

    expected_answer: str = Field(
        min_length=10,
        max_length=4000,
    )

    learner_answer: str = Field(
        min_length=1,
        max_length=12000,
    )

    correctness: EvaluationCorrectness

    evaluation_feedback: str = Field(
        min_length=5,
        max_length=3000,
    )

    missing_points: list[str] = Field(
        default_factory=list,
        max_length=10,
    )

    misconceptions: list[str] = Field(
        default_factory=list,
        max_length=10,
    )

    remediation_kind: RemediationKind

    focus_points: list[str] = Field(
        default_factory=list,
        max_length=10,
    )

    evidence_chunks: list[
        RemediationEvidenceChunk
    ] = Field(
        min_length=1,
        max_length=5,
    )

    @field_validator(
        "evaluation_id",
        "question_id",
    )
    @classmethod
    def clean_id(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError(
                "ID cannot be empty",
            )

        return cleaned

    @field_validator(
        "concept_name",
        "question_prompt",
        "expected_answer",
        "learner_answer",
        "evaluation_feedback",
    )
    @classmethod
    def clean_text_field(
        cls,
        value: str,
    ) -> str:
        cleaned = " ".join(
            value.split(),
        )

        if not cleaned:
            raise ValueError(
                "Text field cannot be empty",
            )

        return cleaned

    @field_validator(
        "missing_points",
        "misconceptions",
        "focus_points",
    )
    @classmethod
    def clean_string_list(
        cls,
        values: list[str],
    ) -> list[str]:
        result: list[str] = []

        seen: set[str] = set()

        for value in values:
            cleaned = " ".join(
                value.split(),
            )

            if not cleaned:
                continue

            key = cleaned.lower()

            if key in seen:
                continue

            seen.add(key)
            result.append(
                cleaned,
            )

        return result

    @field_validator(
        "evidence_chunks",
    )
    @classmethod
    def unique_chunks(
        cls,
        chunks: list[
            RemediationEvidenceChunk
        ],
    ) -> list[
        RemediationEvidenceChunk
    ]:
        result: list[
            RemediationEvidenceChunk
        ] = []

        seen: set[str] = set()

        for chunk in chunks:
            if chunk.id in seen:
                continue

            seen.add(
                chunk.id,
            )

            result.append(
                chunk,
            )

        if not result:
            raise ValueError(
                "At least one evidence chunk "
                "is required",
            )

        return result


class RemediationDraft(
    BaseModel,
):
    explanation: str = Field(
        min_length=20,
        max_length=2500,
    )

    key_takeaways: list[str] = Field(
        min_length=1,
        max_length=5,
    )

    evidence_chunk_ids: list[str] = Field(
        min_length=1,
        max_length=5,
    )

    @field_validator(
        "explanation",
    )
    @classmethod
    def clean_explanation(
        cls,
        value: str,
    ) -> str:
        cleaned = " ".join(
            value.split(),
        )

        if len(cleaned) < 20:
            raise ValueError(
                "Explanation is too short",
            )

        return cleaned

    @field_validator(
        "key_takeaways",
        "evidence_chunk_ids",
    )
    @classmethod
    def clean_list(
        cls,
        values: list[str],
    ) -> list[str]:
        result: list[str] = []

        seen: set[str] = set()

        for value in values:
            cleaned = " ".join(
                value.split(),
            )

            if not cleaned:
                continue

            key = cleaned.lower()

            if key in seen:
                continue

            seen.add(key)

            result.append(
                cleaned,
            )

        if not result:
            raise ValueError(
                "List cannot be empty",
            )

        return result


class RemediationGenerationResult(
    BaseModel,
):
    evaluation_id: str

    remediation_kind: RemediationKind

    explanation: str

    key_takeaways: list[str]

    evidence_chunk_ids: list[str]

    generator_provider: str

    generator_model: str

    generator_version: str