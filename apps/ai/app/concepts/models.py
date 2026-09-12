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
        cleaned = value.strip()

        if len(cleaned) < 10:
            raise ValueError(
                "Concept description is too short",
            )

        return cleaned

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


class ConceptDuplicatePair(BaseModel):
    candidate_id: str = Field(
        min_length=1,
    )

    duplicate_of_candidate_id: str = Field(
        min_length=1,
    )

    @field_validator(
        "candidate_id",
        "duplicate_of_candidate_id",
    )
    @classmethod
    def clean_candidate_id(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError(
                "Candidate ID cannot be empty",
            )

        return cleaned


class ConceptCanonicalizationResult(
    BaseModel,
):
    duplicates: list[
        ConceptDuplicatePair
    ] = Field(
        default_factory=list,
        max_length=200,
    )


class CuratedConceptPlan(BaseModel):
    canonical_id: str = Field(
        min_length=1,
    )

    name: str = Field(
        min_length=2,
        max_length=120,
    )

    importance: int = Field(
        ge=1,
        le=5,
    )

    difficulty: ConceptDifficulty

    @field_validator(
        "canonical_id",
    )
    @classmethod
    def clean_canonical_id(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError(
                "Canonical ID cannot be empty",
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
                "Curated concept name "
                "cannot be empty",
            )

        return cleaned


class ConceptCurationResult(BaseModel):
    concepts: list[
        CuratedConceptPlan
    ] = Field(
        max_length=100,
    )

    discarded_canonical_ids: list[str] = Field(
        default_factory=list,
        max_length=100,
    )

    @field_validator(
        "discarded_canonical_ids",
    )
    @classmethod
    def clean_discarded_ids(
        cls,
        values: list[str],
    ) -> list[str]:
        return list(
            dict.fromkeys(
                value.strip()
                for value in values
                if value.strip()
            )
        )


class AtomicConceptHierarchyInput(BaseModel):
    id: str = Field(
        min_length=1,
        max_length=200,
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

    @field_validator("id")
    @classmethod
    def clean_id(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError(
                "Atomic concept ID cannot be empty",
            )

        return cleaned

    @field_validator("name")
    @classmethod
    def clean_atomic_name(
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
                "Atomic concept name cannot be empty",
            )

        return cleaned

    @field_validator("description")
    @classmethod
    def clean_atomic_description(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if len(cleaned) < 10:
            raise ValueError(
                "Atomic concept description is too short",
            )

        return cleaned


class ConceptHierarchyRequest(BaseModel):
    concepts: list[
        AtomicConceptHierarchyInput
    ] = Field(
        min_length=1,
        max_length=500,
    )

    @field_validator("concepts")
    @classmethod
    def require_unique_atomic_ids(
        cls,
        concepts: list[
            AtomicConceptHierarchyInput
        ],
    ) -> list[
        AtomicConceptHierarchyInput
    ]:
        ids = [
            concept.id
            for concept in concepts
        ]

        if len(ids) != len(set(ids)):
            raise ValueError(
                "Atomic concept IDs must be unique",
            )

        return concepts


class ConceptHierarchyGroupingAssignment(
    BaseModel
):
    position: int = Field(
        ge=1,
        le=100,
    )
    local_group: int = Field(
        ge=1,
        le=10,
    )
    topic_name: str = Field(
        min_length=2,
        max_length=120,
    )
    core_name: str = Field(
        min_length=2,
        max_length=120,
    )

    @field_validator(
        "topic_name",
        "core_name",
    )
    @classmethod
    def clean_grouping_name(
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
                "Hierarchy grouping name "
                "cannot be empty",
            )

        return cleaned


class ConceptHierarchyGroupingResult(
    BaseModel
):
    assignments: list[
        ConceptHierarchyGroupingAssignment
    ] = Field(
        min_length=1,
        max_length=100,
    )


class CoreConceptPlan(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=120,
    )

    description: str = Field(
        min_length=10,
        max_length=600,
    )

    importance: int = Field(
        ge=1,
        le=5,
    )

    atomic_concept_ids: list[str] = Field(
        min_length=1,
        max_length=500,
    )

    @field_validator("name")
    @classmethod
    def clean_core_name(
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
                "Core Concept name cannot be empty",
            )

        return cleaned

    @field_validator("description")
    @classmethod
    def clean_core_description(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if len(cleaned) < 10:
            raise ValueError(
                "Core Concept description is too short",
            )

        return cleaned

    @field_validator("atomic_concept_ids")
    @classmethod
    def clean_atomic_concept_ids(
        cls,
        values: list[str],
    ) -> list[str]:
        cleaned = [
            value.strip()
            for value in values
        ]

        if any(
            not value
            for value in cleaned
        ):
            raise ValueError(
                "Atomic concept IDs cannot be empty",
            )

        # Do NOT deduplicate here.
        #
        # Duplicate membership represents an invalid
        # hierarchy and must remain visible to the
        # deterministic hierarchy-service validation.
        return cleaned


class StudyTopicPlan(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=120,
    )

    description: str | None = Field(
        default=None,
        max_length=600,
    )

    core_concepts: list[
        CoreConceptPlan
    ] = Field(
        min_length=1,
        max_length=50,
    )

    @field_validator("name")
    @classmethod
    def clean_topic_name(
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
                "Study Topic name cannot be empty",
            )

        return cleaned

    @field_validator("description")
    @classmethod
    def clean_topic_description(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        cleaned = value.strip()

        return cleaned or None


class ConceptHierarchyResult(BaseModel):
    topics: list[
        StudyTopicPlan
    ] = Field(
        min_length=1,
        max_length=50,
    )
