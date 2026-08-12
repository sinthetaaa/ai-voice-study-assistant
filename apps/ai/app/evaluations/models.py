from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)

from app.questions.models import (
    QuestionDifficulty,
    QuestionType,
)


AnswerCorrectness = Literal[
    "CORRECT",
    "PARTIAL",
    "INCORRECT",
]


class EvaluationEvidenceChunk(
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
                "Evidence chunk text cannot be empty",
            )

        return cleaned


class AnswerEvaluationRequest(
    BaseModel,
):
    question_id: str = Field(
        min_length=1,
    )

    concept_name: str = Field(
        min_length=2,
        max_length=160,
    )

    question_type: QuestionType

    difficulty: QuestionDifficulty

    prompt: str = Field(
        min_length=10,
        max_length=2000,
    )

    expected_answer: str = Field(
        min_length=20,
        max_length=4000,
    )

    evidence_chunks: list[
        EvaluationEvidenceChunk
    ] = Field(
        min_length=1,
        max_length=5,
    )

    answer_text: str = Field(
        min_length=1,
        max_length=12000,
    )

    @field_validator("question_id")
    @classmethod
    def clean_question_id(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError(
                "Question ID cannot be empty",
            )

        return cleaned

    @field_validator("concept_name")
    @classmethod
    def clean_concept_name(
        cls,
        value: str,
    ) -> str:
        cleaned = " ".join(
            value.split(),
        )

        if len(cleaned) < 2:
            raise ValueError(
                "Concept name is too short",
            )

        return cleaned

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

    @field_validator("answer_text")
    @classmethod
    def clean_answer_text(
        cls,
        value: str,
    ) -> str:
        cleaned = " ".join(
            value.split(),
        )

        if not cleaned:
            raise ValueError(
                "Student answer cannot be empty",
            )

        return cleaned

    @field_validator("evidence_chunks")
    @classmethod
    def unique_evidence_chunks(
        cls,
        chunks: list[
            EvaluationEvidenceChunk
        ],
    ) -> list[
        EvaluationEvidenceChunk
    ]:
        seen: set[str] = set()

        unique_chunks: list[
            EvaluationEvidenceChunk
        ] = []

        for chunk in chunks:
            if chunk.id in seen:
                continue

            seen.add(chunk.id)

            unique_chunks.append(
                chunk,
            )

        if not unique_chunks:
            raise ValueError(
                "At least one evidence chunk "
                "is required",
            )

        return unique_chunks


class EvaluationDraft(
    BaseModel,
):
    score: float = Field(
        ge=0.0,
        le=1.0,
    )

    feedback: str = Field(
        min_length=5,
        max_length=2000,
    )

    missing_points: list[str] = Field(
        default_factory=list,
        max_length=10,
    )

    misconceptions: list[str] = Field(
        default_factory=list,
        max_length=10,
    )

    @field_validator("feedback")
    @classmethod
    def clean_feedback(
        cls,
        value: str,
    ) -> str:
        cleaned = " ".join(
            value.split(),
        )

        if len(cleaned) < 5:
            raise ValueError(
                "Feedback is too short",
            )

        return cleaned

    @field_validator(
        "missing_points",
        "misconceptions",
    )
    @classmethod
    def clean_string_list(
        cls,
        values: list[str],
    ) -> list[str]:
        cleaned: list[str] = []

        seen: set[str] = set()

        for value in values:
            normalized = " ".join(
                value.split(),
            )

            if not normalized:
                continue

            key = normalized.lower()

            if key in seen:
                continue

            seen.add(key)

            cleaned.append(
                normalized,
            )

        return cleaned


class AnswerEvaluationResult(
    BaseModel,
):
    question_id: str = Field(
        min_length=1,
    )

    score: float = Field(
        ge=0.0,
        le=1.0,
    )

    correctness: AnswerCorrectness

    feedback: str = Field(
        min_length=5,
        max_length=2000,
    )

    missing_points: list[str] = Field(
        default_factory=list,
    )

    misconceptions: list[str] = Field(
        default_factory=list,
    )

    evaluator_provider: str = Field(
        min_length=1,
    )

    evaluator_model: str = Field(
        min_length=1,
    )

    evaluator_version: str = Field(
        min_length=1,
    )