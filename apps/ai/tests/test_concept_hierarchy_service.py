import unittest

from app.concepts.hierarchy_service import (
    ConceptHierarchyService,
    ConceptHierarchyValidationError,
)
from app.concepts.models import (
    AtomicConceptHierarchyInput,
    ConceptHierarchyGroupingAssignment,
    ConceptHierarchyGroupingResult,
    ConceptHierarchyRequest,
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
        results,
    ) -> None:
        if isinstance(results, list):
            self.results = results
        else:
            self.results = [results]

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
        call_index = len(self.calls)

        self.calls.append(
            {
                "messages": messages,
                "response_model": (
                    response_model
                ),
            }
        )

        result_index = min(
            call_index,
            len(self.results) - 1,
        )

        return self.results[result_index]


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


def single_core_result(
    topic_name: str,
    core_name: str,
    atomic_ids: list[str],
) -> ConceptHierarchyResult:
    return ConceptHierarchyResult(
        topics=[
            StudyTopicPlan(
                name=topic_name,
                description=(
                    f"{topic_name} concepts "
                    "for staged hierarchy testing."
                ),
                core_concepts=[
                    CoreConceptPlan(
                        name=core_name,
                        description=(
                            f"{core_name} groups related "
                            "concepts for hierarchy testing."
                        ),
                        importance=4,
                        atomic_concept_ids=atomic_ids,
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

    async def test_semantic_failure_is_repaired(
        self,
    ) -> None:
        invalid = valid_result()
        invalid.topics[1].core_concepts[
            0
        ].atomic_concept_ids = [
            "concept-3",
            "invented-concept",
        ]

        repaired = valid_result()

        provider = FakeLlmProvider(
            [
                invalid,
                repaired,
            ],
        )

        service = ConceptHierarchyService(
            llm_provider=provider,
        )

        generated = await service.generate(
            self.concepts,
        )

        self.assertIs(
            generated,
            repaired,
        )

        self.assertEqual(
            len(provider.calls),
            2,
        )

        repair_prompt = provider.calls[1][
            "messages"
        ][1].content

        self.assertIn(
            "REPAIR ATTEMPT",
            repair_prompt,
        )

        self.assertIn(
            "unknown atomic concept IDs",
            repair_prompt,
        )

        self.assertIn(
            "invented-concept",
            repair_prompt,
        )

        self.assertIn(
            "PREVIOUS_INVALID_HIERARCHY",
            repair_prompt,
        )

    async def test_semantic_failure_exhausts_retries(
        self,
    ) -> None:
        invalid = valid_result()
        invalid.topics[1].core_concepts[
            0
        ].atomic_concept_ids = [
            "concept-3",
            "invented-concept",
        ]

        provider = FakeLlmProvider(
            invalid,
        )

        service = ConceptHierarchyService(
            llm_provider=provider,
        )

        with self.assertRaisesRegex(
            ConceptHierarchyValidationError,
            (
                "Hierarchy generation failed "
                "semantic validation after retries"
            ),
        ):
            await service.generate(
                self.concepts,
            )

        self.assertEqual(
            len(provider.calls),
            service.SEMANTIC_ATTEMPTS,
        )

    async def test_grouping_repairs_missing_position(
        self,
    ) -> None:
        invalid = ConceptHierarchyGroupingResult(
            assignments=[
                ConceptHierarchyGroupingAssignment(
                    position=1,
                    local_group=1,
                    topic_name="Learning Foundations",
                    core_name="Value Learning",
                ),
                ConceptHierarchyGroupingAssignment(
                    position=3,
                    local_group=1,
                    topic_name="Learning Strategies",
                    core_name="Exploration Strategies",
                ),
            ],
        )

        repaired = ConceptHierarchyGroupingResult(
            assignments=[
                ConceptHierarchyGroupingAssignment(
                    position=1,
                    local_group=1,
                    topic_name="Learning Foundations",
                    core_name="Value Learning",
                ),
                ConceptHierarchyGroupingAssignment(
                    position=2,
                    local_group=1,
                    topic_name="Learning Foundations",
                    core_name="Value Learning",
                ),
                ConceptHierarchyGroupingAssignment(
                    position=3,
                    local_group=1,
                    topic_name="Learning Strategies",
                    core_name="Exploration Strategies",
                ),
            ],
        )

        provider = FakeLlmProvider(
            [
                invalid,
                repaired,
            ],
        )

        service = ConceptHierarchyService(
            llm_provider=provider,
        )

        generated = await (
            service._generate_grouped_hierarchy(
                self.concepts,
            )
        )

        self.assertEqual(
            len(provider.calls),
            2,
        )

        repair_prompt = provider.calls[1][
            "messages"
        ][1].content

        self.assertIn(
            "omitted positions: 2",
            repair_prompt,
        )

        assigned_ids = [
            concept_id
            for topic in generated.topics
            for core in topic.core_concepts
            for concept_id in (
                core.atomic_concept_ids
            )
        ]

        self.assertEqual(
            assigned_ids,
            [
                "concept-1",
                "concept-2",
                "concept-3",
            ],
        )

    async def test_grouping_uses_local_group_for_membership(
        self,
    ) -> None:
        concepts = [
            atomic(
                f"grouped-{index:02d}",
                f"Grouped Concept {index}",
            )
            for index in range(
                1,
                13,
            )
        ]

        result = ConceptHierarchyGroupingResult(
            assignments=[
                ConceptHierarchyGroupingAssignment(
                    position=index,
                    local_group=(
                        ((index - 1) % 4) + 1
                    ),
                    topic_name=(
                        f"Generated Topic {index}"
                    ),
                    core_name=(
                        f"Generated Core {index}"
                    ),
                )
                for index in range(
                    1,
                    13,
                )
            ],
        )

        provider = FakeLlmProvider(
            result,
        )

        service = ConceptHierarchyService(
            llm_provider=provider,
        )

        generated = await (
            service._generate_grouped_hierarchy(
                concepts,
            )
        )

        core_count = sum(
            len(topic.core_concepts)
            for topic in generated.topics
        )

        self.assertEqual(
            core_count,
            4,
        )

        assigned_ids = [
            concept_id
            for topic in generated.topics
            for core in topic.core_concepts
            for concept_id in (
                core.atomic_concept_ids
            )
        ]

        self.assertEqual(
            len(assigned_ids),
            12,
        )

        self.assertEqual(
            set(assigned_ids),
            {
                concept.id
                for concept in concepts
            },
        )

    def test_request_accepts_more_than_one_hundred_concepts(
        self,
    ) -> None:
        concepts = [
            atomic(
                f"large-{index:03d}",
                f"Large Concept {index}",
            )
            for index in range(
                1,
                128,
            )
        ]

        request = ConceptHierarchyRequest(
            concepts=concepts,
        )

        self.assertEqual(
            len(request.concepts),
            127,
        )

    async def test_large_hierarchy_is_staged_and_expanded(
        self,
    ) -> None:
        concepts = [
            atomic(
                f"large-{index:03d}",
                f"Large Concept {index}",
            )
            for index in range(
                1,
                102,
            )
        ]

        batches = [
            concepts[0:30],
            concepts[30:60],
            concepts[60:90],
            concepts[90:101],
        ]

        local_results = [
            ConceptHierarchyGroupingResult(
                assignments=[
                    ConceptHierarchyGroupingAssignment(
                        position=position,
                        local_group=1,
                        topic_name=(
                            f"Batch {index}"
                        ),
                        core_name=(
                            f"Batch {index} Core"
                        ),
                    )
                    for position, _
                    in enumerate(
                        batch,
                        start=1,
                    )
                ],
            )
            for index, batch
            in enumerate(
                batches,
                start=1,
            )
        ]

        global_result = ConceptHierarchyGroupingResult(
            assignments=[
                ConceptHierarchyGroupingAssignment(
                    position=position,
                    local_group=1,
                    topic_name="Global Topic",
                    core_name="Global Core",
                )
                for position in range(
                    1,
                    5,
                )
            ],
        )

        provider = FakeLlmProvider(
            [
                *local_results,
                global_result,
            ],
        )

        service = ConceptHierarchyService(
            llm_provider=provider,
        )

        generated = await service.generate(
            concepts,
        )

        self.assertEqual(
            len(provider.calls),
            5,
        )

        first_local_prompt = provider.calls[0][
            "messages"
        ][1].content

        self.assertIn(
            '"position":1',
            first_local_prompt,
        )

        self.assertNotIn(
            '"id":"atomic-001"',
            first_local_prompt,
        )

        self.assertNotIn(
            '"id":"large-001"',
            first_local_prompt,
        )

        self.assertIs(
            provider.calls[0][
                "response_model"
            ],
            ConceptHierarchyGroupingResult,
        )

        self.assertIs(
            provider.calls[-1][
                "response_model"
            ],
            ConceptHierarchyGroupingResult,
        )

        global_prompt = provider.calls[-1][
            "messages"
        ][1].content

        self.assertIn(
            '"position":1',
            global_prompt,
        )

        self.assertNotIn(
            "hierarchy-group-0001",
            global_prompt,
        )

        assigned_ids = [
            concept_id
            for topic in generated.topics
            for core in topic.core_concepts
            for concept_id in (
                core.atomic_concept_ids
            )
        ]

        self.assertEqual(
            len(assigned_ids),
            101,
        )

        self.assertEqual(
            set(assigned_ids),
            {
                concept.id
                for concept in concepts
            },
        )

        self.assertFalse(
            any(
                concept_id.startswith(
                    "hierarchy-group-"
                )
                for concept_id
                in assigned_ids
            )
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
