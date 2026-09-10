import unittest

from app.concepts.hierarchy_service import (
    ConceptHierarchyService,
    ConceptHierarchyValidationError,
)
from app.concepts.models import (
    AtomicConceptHierarchyInput,
    ConceptHierarchyResult,
    CoreConceptPlan,
    StudyTopicPlan,
)
from app.llm.provider import (
    LlmProvider,
)


class FakeLlmProvider(LlmProvider):
    def __init__(
        self,
        result: ConceptHierarchyResult,
    ) -> None:
        self.result = result
        self.calls = []

    @property
    def provider_name(self) -> str:
        return "fake"

    @property
    def model_name(self) -> str:
        return "fake-model"

    async def generate_structured(
        self,
        messages,
        response_model,
    ):
        self.calls.append(
            {
                "messages": messages,
                "response_model": (
                    response_model
                ),
            }
        )

        return self.result


def atomic(
    concept_id: str,
    name: str,
) -> AtomicConceptHierarchyInput:
    return AtomicConceptHierarchyInput(
        id=concept_id,
        name=name,
        description=(
            f"{name} is an academic concept "
            "used for hierarchy testing."
        ),
        importance=3,
        difficulty="INTERMEDIATE",
    )


def valid_result(
) -> ConceptHierarchyResult:
    return ConceptHierarchyResult(
        topics=[
            StudyTopicPlan(
                name="Learning Foundations",
                description=(
                    "Foundational principles "
                    "for the subject."
                ),
                core_concepts=[
                    CoreConceptPlan(
                        name="Value Learning",
                        description=(
                            "Core ideas for learning "
                            "state-action values."
                        ),
                        importance=5,
                        atomic_concept_ids=[
                            "concept-1",
                            "concept-2",
                        ],
                    ),
                ],
            ),
            StudyTopicPlan(
                name="Learning Strategies",
                description=(
                    "Methods that control "
                    "learning behaviour."
                ),
                core_concepts=[
                    CoreConceptPlan(
                        name="Exploration Strategies",
                        description=(
                            "Strategies balancing "
                            "exploration and exploitation."
                        ),
                        importance=4,
                        atomic_concept_ids=[
                            "concept-3",
                        ],
                    ),
                ],
            ),
        ],
    )


class ConceptHierarchyServiceTest(
    unittest.IsolatedAsyncioTestCase,
):
    def setUp(self) -> None:
        self.concepts = [
            atomic(
                "concept-1",
                "Q-Learning",
            ),
            atomic(
                "concept-2",
                "Bellman Equation",
            ),
            atomic(
                "concept-3",
                "Epsilon-Greedy Strategy",
            ),
        ]

    async def test_valid_hierarchy_is_preserved(
        self,
    ) -> None:
        result = valid_result()

        provider = FakeLlmProvider(
            result,
        )

        service = ConceptHierarchyService(
            llm_provider=provider,
        )

        generated = await service.generate(
            self.concepts,
        )

        self.assertIs(
            generated,
            result,
        )

        self.assertEqual(
            len(provider.calls),
            1,
        )

        self.assertIs(
            provider.calls[0][
                "response_model"
            ],
            ConceptHierarchyResult,
        )

    async def test_unknown_atomic_id_is_rejected(
        self,
    ) -> None:
        result = valid_result()

        result.topics[1].core_concepts[
            0
        ].atomic_concept_ids = [
            "concept-3",
            "invented-concept",
        ]

        service = ConceptHierarchyService(
            llm_provider=FakeLlmProvider(
                result,
            ),
        )

        with self.assertRaisesRegex(
            ConceptHierarchyValidationError,
            "unknown atomic concept IDs",
        ):
            await service.generate(
                self.concepts,
            )

    async def test_duplicate_assignment_is_rejected(
        self,
    ) -> None:
        result = valid_result()

        result.topics[1].core_concepts[
            0
        ].atomic_concept_ids = [
            "concept-2",
            "concept-3",
        ]

        service = ConceptHierarchyService(
            llm_provider=FakeLlmProvider(
                result,
            ),
        )

        with self.assertRaisesRegex(
            ConceptHierarchyValidationError,
            "more than once",
        ):
            await service.generate(
                self.concepts,
            )

    async def test_missing_atomic_concept_is_rejected(
        self,
    ) -> None:
        # Omit concept-3 by removing its Topic from
        # an otherwise valid hierarchy.
        result = valid_result()
        result.topics = [
            result.topics[0],
        ]

        service = ConceptHierarchyService(
            llm_provider=FakeLlmProvider(
                result,
            ),
        )

        with self.assertRaisesRegex(
            ConceptHierarchyValidationError,
            "omitted atomic concept IDs",
        ):
            await service.generate(
                self.concepts,
            )

    async def test_duplicate_atomic_id_inside_same_core_is_rejected(
        self,
    ) -> None:
        result = valid_result()

        result.topics[0].core_concepts[
            0
        ].atomic_concept_ids = [
            "concept-1",
            "concept-1",
            "concept-2",
        ]

        service = ConceptHierarchyService(
            llm_provider=FakeLlmProvider(
                result,
            ),
        )

        with self.assertRaisesRegex(
            ConceptHierarchyValidationError,
            "more than once",
        ):
            await service.generate(
                self.concepts,
            )

    async def test_duplicate_core_names_are_rejected(
        self,
    ) -> None:
        result = valid_result()

        result.topics[1].core_concepts[
            0
        ].name = "Value Learning"

        service = ConceptHierarchyService(
            llm_provider=FakeLlmProvider(
                result,
            ),
        )

        with self.assertRaisesRegex(
            ConceptHierarchyValidationError,
            "duplicate Core Concept name",
        ):
            await service.generate(
                self.concepts,
            )


if __name__ == "__main__":
    unittest.main()
