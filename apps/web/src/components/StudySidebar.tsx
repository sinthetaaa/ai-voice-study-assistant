import type {
  StudyPackCoverageTopic,
  StudySession,
} from "../lib/studyloop-api";

type StudySidebarProps = {
  sessionProgress?: StudySession["progress"] | null;

  coverage: number;

  coverageAuthoritative?: boolean;
  coveredCoreConceptCount?: number;

  totalCoreConceptCount?: number;

  sessionNumber?: number;

  currentConceptId?: string | null;

  coverageTopics?: StudyPackCoverageTopic[];

  conceptFlow: {
    id: string;

    name: string;

    status: string;

    reviewRequired: boolean;

    mastery: {
      score: number;
    };
  }[];
};

export default function StudySidebar({
  sessionProgress = null,
  coverage,
  coverageAuthoritative = false,
  coveredCoreConceptCount,
  totalCoreConceptCount,
  sessionNumber = 1,
  currentConceptId,
  coverageTopics = [],
  conceptFlow,
}: StudySidebarProps) {
  const safeCoverage = clampPercentage(coverage);

  const answeredQuestionCount = Math.max(
    0,
    sessionProgress?.answeredQuestionCount ?? 0,
  );

  const targetQuestionCount = Math.max(
    0,
    sessionProgress?.targetQuestionCount ?? 0,
  );

  const maximumQuestionCount = Math.max(
    1,
    sessionProgress?.maximumQuestionCount ?? 1,
  );

  const sessionProgressPercent = Math.min(
    100,
    (answeredQuestionCount / maximumQuestionCount) * 100,
  );

  const sessionTargetPercent = Math.min(
    100,
    Math.max(0, (targetQuestionCount / maximumQuestionCount) * 100),
  );

  let sessionProgressStatus = `${sessionProgress?.remainingToTarget ?? 0} to target`;

  if (sessionProgress?.maximumReached) {
    sessionProgressStatus = "Session limit reached";
  } else if (
    sessionProgress?.targetReached &&
    answeredQuestionCount > targetQuestionCount
  ) {
    sessionProgressStatus = "Adaptive practice";
  } else if (sessionProgress?.targetReached) {
    sessionProgressStatus = "Target reached";
  }

  const displayCoverage = coverageAuthoritative ? safeCoverage : 0;

  const currentSessionConcept =
    conceptFlow.find((concept) => concept.id === currentConceptId) ??
    conceptFlow.find((concept) => concept.status === "IN_PROGRESS") ??
    null;

  const currentHierarchyFocus =
    coverageAuthoritative && currentSessionConcept
      ? findHierarchyFocus(coverageTopics, currentSessionConcept.id)
      : null;

  const currentFocusMastery = currentSessionConcept
    ? clampPercentage(currentSessionConcept.mastery.score * 100)
    : 0;

  return (
    <aside className="study-sidebar study-sidebar-final">
      {sessionProgress && (
        <section className="final-sidebar-card final-session-progress-card">
          <div className="final-card-header">
            <div className="final-title-with-info">
              <span>SESSION PROGRESS</span>

              <InfoHint text="Tracks progress through this bounded Normal Study sitting. Adaptive practice may continue beyond the target, up to the session maximum." />
            </div>

            <span className="final-session-number">
              Session {String(sessionNumber).padStart(2, "0")}
            </span>
          </div>

          <div className="final-session-progress-values">
            <strong>{answeredQuestionCount}</strong>
            <span>{sessionProgressStatus}</span>
          </div>

          <div
            className="final-session-progress-track"
            role="progressbar"
            aria-label="Normal Study session progress"
            aria-valuemin={0}
            aria-valuemax={maximumQuestionCount}
            aria-valuenow={Math.min(
              answeredQuestionCount,
              maximumQuestionCount,
            )}
            aria-valuetext={`${answeredQuestionCount} answered, target ${targetQuestionCount}, maximum ${maximumQuestionCount}`}
          >
            <span
              className="final-session-progress-fill"
              style={{
                width: `${sessionProgressPercent}%`,
              }}
            />

            <span
              className="final-session-progress-target"
              style={{
                left: `${sessionTargetPercent}%`,
              }}
              aria-hidden="true"
            />
          </div>

          <div className="final-session-progress-scale">
            <span>TARGET {targetQuestionCount}</span>
            <span>MAX {maximumQuestionCount}</span>
          </div>
        </section>
      )}

      <section className="final-sidebar-card final-coverage-card">
        <div className="final-card-header">
          <div className="final-title-with-info">
            <span>STUDY PACK COVERAGE</span>

            <InfoHint text="Tracks how much of the important material has been tested across sessions." />
          </div>
        </div>

        <div className="final-coverage-values">
          <strong>
            {coverageAuthoritative ? `${Math.round(displayCoverage)}%` : "—"}
          </strong>
          {coverageAuthoritative &&
            typeof coveredCoreConceptCount === "number" &&
            typeof totalCoreConceptCount === "number" && (
              <span>
                {coveredCoreConceptCount} / {totalCoreConceptCount} Core
                Concepts covered
              </span>
            )}
        </div>
        <div
          className="final-coverage-track"
          role="progressbar"
          aria-label="Study Pack Coverage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(displayCoverage)}
        >
          <div
            className="final-coverage-fill"
            style={{
              width: `${displayCoverage}%`,
            }}
          />
        </div>
      </section>

      <section className="final-sidebar-card final-concept-card">
        <div className="current-focus-title-row">
          <h3>CURRENT FOCUS</h3>
        </div>

        {currentSessionConcept ? (
          <div className="current-focus-content">
            {currentHierarchyFocus ? (
              <div className="current-focus-hierarchy">
                <span className="current-focus-topic">
                  {currentHierarchyFocus.topic.name}
                </span>

                <span className="current-focus-connector" aria-hidden="true">
                  ↓
                </span>

                <span className="current-focus-core">
                  {currentHierarchyFocus.coreConcept.name}
                </span>

                <span className="current-focus-connector" aria-hidden="true">
                  ↓
                </span>
              </div>
            ) : (
              <span className="current-focus-hierarchy-status">
                {coverageAuthoritative
                  ? "Current concept"
                  : "Concept map updating"}
              </span>
            )}

            <div className="current-focus-atomic">
              <div className="current-focus-atomic-row">
                <span>{currentSessionConcept.name}</span>
                <strong>{Math.round(currentFocusMastery)}%</strong>
              </div>

              <div
                className="final-concept-track"
                role="progressbar"
                aria-label={`${currentSessionConcept.name} session mastery`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(currentFocusMastery)}
              >
                <div
                  className="final-concept-fill"
                  style={{
                    width: `${currentFocusMastery}%`,
                  }}
                />
              </div>

              <span className="current-focus-metric-label">
                Session mastery
              </span>
            </div>
          </div>
        ) : (
          <p className="current-focus-empty">
            No active concept in this session.
          </p>
        )}

        <ConceptHierarchyMap
          topics={coverageTopics}
          authoritative={coverageAuthoritative}
        />
      </section>
    </aside>
  );
}

function findHierarchyFocus(
  topics: StudyPackCoverageTopic[],
  atomicConceptId: string,
) {
  for (const topic of topics) {
    for (const coreConcept of topic.coreConcepts) {
      const atomicConcept = coreConcept.atomicConcepts.find(
        (concept) => concept.id === atomicConceptId,
      );

      if (atomicConcept) {
        return {
          topic,
          coreConcept,
          atomicConcept,
        };
      }
    }
  }

  return null;
}

function ConceptHierarchyMap({
  topics,
  authoritative,
}: {
  topics: StudyPackCoverageTopic[];
  authoritative: boolean;
}) {
  if (!authoritative) {
    return (
      <p className="concept-hierarchy-unavailable">Concept map is updating.</p>
    );
  }

  if (topics.length === 0) {
    return (
      <p className="concept-hierarchy-unavailable">
        Concept map is not available yet.
      </p>
    );
  }

  return (
    <details className="concept-hierarchy-details">
      <summary>
        <span>View concept map</span>
        <span className="concept-hierarchy-summary-icon" aria-hidden="true">
          +
        </span>
      </summary>

      <div className="concept-hierarchy-panel">
        <div className="concept-hierarchy-header">
          <div>
            <strong>STUDY PACK CONCEPT MAP</strong>
            <span>Topics → Core Concepts → Atomic Concepts</span>
          </div>

          <span>{topics.length} topics</span>
        </div>

        <div className="concept-hierarchy-topic-list">
          {topics.map((topic) => (
            <section className="concept-hierarchy-topic" key={topic.id}>
              <div className="concept-hierarchy-topic-heading">
                <strong>{topic.name}</strong>
                {topic.description && <span>{topic.description}</span>}
              </div>

              <div className="concept-hierarchy-core-list">
                {topic.coreConcepts.map((coreConcept) => (
                  <div className="concept-hierarchy-core" key={coreConcept.id}>
                    <div className="concept-hierarchy-core-heading">
                      <div>
                        <strong>{coreConcept.name}</strong>
                        <span>
                          {Math.round(coreConcept.coverage.ratio * 100)}%
                          covered
                        </span>
                      </div>

                      <span
                        className={`concept-hierarchy-state concept-hierarchy-state-${coreConcept.coverage.state
                          .toLowerCase()
                          .replace("_", "-")}`}
                      >
                        {coverageStateLabel(coreConcept.coverage.state)}
                      </span>
                    </div>

                    <div className="concept-hierarchy-atomic-list">
                      {coreConcept.atomicConcepts.map((atomicConcept) => (
                        <div
                          className="concept-hierarchy-atomic"
                          key={atomicConcept.id}
                        >
                          <span
                            className={
                              atomicConcept.tested
                                ? "concept-hierarchy-atomic-marker concept-hierarchy-atomic-marker-tested"
                                : "concept-hierarchy-atomic-marker"
                            }
                            aria-hidden="true"
                          >
                            {atomicConcept.tested ? "✓" : "○"}
                          </span>

                          <span>{atomicConcept.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </details>
  );
}

function coverageStateLabel(state: "UNTOUCHED" | "IN_PROGRESS" | "COVERED") {
  switch (state) {
    case "COVERED":
      return "COVERED";

    case "IN_PROGRESS":
      return "IN PROGRESS";

    case "UNTOUCHED":
      return "UNTOUCHED";
  }
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="final-info-wrap">
      <button type="button" className="final-info-button" aria-label={text}>
        !
      </button>

      <span className="final-info-tooltip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function shorten(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}
