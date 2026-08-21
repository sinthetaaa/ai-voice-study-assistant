import type { CSSProperties } from "react";

import type { ConceptGraph } from "../lib/studyloop-api";

type StudySidebarProps = {
  mastery: number;

  coverage: number;

  testedConceptCount?: number;

  totalConceptCount?: number;

  sessionNumber?: number;

  currentConceptId?: string | null;

  conceptGraph?: ConceptGraph | null;

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
  mastery,
  coverage,
  testedConceptCount,
  totalConceptCount,
  sessionNumber = 1,
  currentConceptId,
  conceptGraph,
  conceptFlow,
}: StudySidebarProps) {
  const safeMastery = clampPercentage(mastery);
  const safeCoverage = clampPercentage(coverage);

  return (
    <aside className="study-sidebar study-sidebar-final">
      <section className="final-sidebar-card final-mastery-card">
        <div className="final-card-header">
          <div className="final-title-with-info">
            <span>SESSION MASTERY</span>

            <InfoHint text="Measures what you have demonstrated in this study session." />
          </div>

          <span className="final-session-number">
            Session {String(sessionNumber).padStart(2, "0")}
          </span>
        </div>

        <MasteryRing percentage={safeMastery} />
      </section>

      <section className="final-sidebar-card final-coverage-card">
        <div className="final-card-header">
          <div className="final-title-with-info">
            <span>STUDY PACK COVERAGE</span>

            <InfoHint text="Tracks how much of the important material has been tested across sessions." />
          </div>
        </div>

        <div className="final-coverage-values">
          <strong>{Math.round(safeCoverage)}%</strong>

          {typeof testedConceptCount === "number" &&
            typeof totalConceptCount === "number" && (
              <span>
                {testedConceptCount} / {totalConceptCount} concepts
              </span>
            )}
        </div>

        <div
          className="final-coverage-track"
          role="progressbar"
          aria-label="Study Pack Coverage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(safeCoverage)}
        >
          <div
            className="final-coverage-fill"
            style={{
              width: `${safeCoverage}%`,
            }}
          />
        </div>
      </section>

      <section className="final-sidebar-card final-concept-card">
        <div className="concept-flow-title-row">
          <h3>CONCEPT FLOW</h3>

          <ConceptGraphPopover
            graph={conceptGraph ?? null}
            currentConceptId={currentConceptId ?? null}
            sessionConceptIds={conceptFlow.map((concept) => concept.id)}
          />
        </div>

        <div className="final-concept-list">
          {conceptFlow.map((concept) => {
            const percentage = clampPercentage(concept.mastery.score * 100);

            return (
              <div className="final-concept-item" key={concept.id}>
                <div className="final-concept-label-row">
                  <span>{concept.name}</span>

                  <strong>{Math.round(percentage)}%</strong>
                </div>

                <div
                  className="final-concept-track"
                  role="progressbar"
                  aria-label={`${concept.name} session mastery`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percentage)}
                >
                  <div
                    className="final-concept-fill"
                    style={{
                      width: `${percentage}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function ConceptGraphPopover({
  graph,
  currentConceptId,
  sessionConceptIds,
}: {
  graph: ConceptGraph | null;

  currentConceptId: string | null;

  sessionConceptIds: string[];
}) {
  const flowNodes = buildConceptFlowNodes(
    graph,
    currentConceptId,
    sessionConceptIds,
  );

  return (
    <span className="concept-flow-hover-trigger">
      <button
        type="button"
        className="final-info-button concept-flow-hover-button"
        aria-label="Show concept flow"
      >
        !
      </button>

      <span className="concept-flow-hover-panel">
        <span className="concept-flow-hover-header">
          <strong>CONCEPT FLOW</strong>
        </span>

        {flowNodes.length === 0 ? (
          <span className="concept-flow-hover-empty">
            Concept flow is not available yet.
          </span>
        ) : (
          <span className="concept-path-shell">
            <span className="concept-path-fade concept-path-fade-top" />

            <span className="concept-path-line" />

            <span className="concept-path-list">
              {flowNodes.map((node) => {
                const isCurrent = node.id === currentConceptId;

                const isSessionConcept = sessionConceptIds.includes(node.id);

                return (
                  <span
                    key={node.id}
                    className={
                      isCurrent
                        ? "concept-path-item concept-path-item-current"
                        : isSessionConcept
                          ? "concept-path-item concept-path-item-session"
                          : "concept-path-item"
                    }
                  >
                    <span className="concept-path-node-wrap">
                      <span className="concept-path-node" />
                    </span>

                    <span className="concept-path-copy">
                      <strong>{node.name}</strong>

                      {isCurrent && <span>CURRENT CONCEPT</span>}
                    </span>
                  </span>
                );
              })}
            </span>

            <span className="concept-path-fade concept-path-fade-bottom" />
          </span>
        )}
      </span>
    </span>
  );
}

function buildConceptFlowNodes(
  graph: ConceptGraph | null,
  currentConceptId: string | null,
  sessionConceptIds: string[],
): ConceptGraph["nodes"] {
  if (!graph || graph.nodes.length === 0) {
    return [];
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  const ordered: ConceptGraph["nodes"] = [];

  /*
   * The live StudySession order is the strongest signal
   * for the learner-facing flow.
   */
  for (const conceptId of sessionConceptIds) {
    const node = nodeById.get(conceptId);

    if (node) {
      ordered.push(node);
    }
  }

  /*
   * If the graph contains related concepts not currently
   * selected into the session, include a small number of
   * immediate neighbors to give the path some context.
   */
  const selectedIds = new Set(ordered.map((node) => node.id));

  if (currentConceptId) {
    const neighboringIds: string[] = [];

    for (const edge of graph.edges) {
      if (
        edge.sourceConceptId === currentConceptId &&
        !selectedIds.has(edge.targetConceptId)
      ) {
        neighboringIds.push(edge.targetConceptId);
      }

      if (
        edge.targetConceptId === currentConceptId &&
        !selectedIds.has(edge.sourceConceptId)
      ) {
        neighboringIds.push(edge.sourceConceptId);
      }
    }

    for (const neighborId of neighboringIds) {
      const node = nodeById.get(neighborId);

      if (!node) {
        continue;
      }

      ordered.push(node);
      selectedIds.add(node.id);

      if (ordered.length >= 7) {
        break;
      }
    }
  }

  /*
   * Ensure the current concept is present even if a stale
   * session snapshot somehow omitted it from conceptFlow.
   */
  if (
    currentConceptId &&
    !ordered.some((node) => node.id === currentConceptId)
  ) {
    const current = nodeById.get(currentConceptId);

    if (current) {
      ordered.unshift(current);
    }
  }

  /*
   * Keep the hover visualization intentionally compact.
   * Recenter the visible window around the current node.
   */
  const currentIndex = ordered.findIndex(
    (node) => node.id === currentConceptId,
  );

  if (ordered.length <= 7) {
    return ordered;
  }

  if (currentIndex === -1) {
    return ordered.slice(0, 7);
  }

  let start = Math.max(0, currentIndex - 3);

  let end = start + 7;

  if (end > ordered.length) {
    end = ordered.length;

    start = Math.max(0, end - 7);
  }

  return ordered.slice(start, end);
}

function MasteryRing({ percentage }: { percentage: number }) {
  const radius = 82;

  const circumference = 2 * Math.PI * radius;

  const dashOffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="final-mastery-ring-wrap">
      <svg
        className="final-mastery-ring"
        viewBox="0 0 200 200"
        role="progressbar"
        aria-label="Session Mastery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
      >
        <circle className="final-mastery-track" cx="100" cy="100" r={radius} />

        {percentage > 0 && (
          <circle
            className="final-mastery-progress"
            cx="100"
            cy="100"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        )}
      </svg>

      <strong className="final-mastery-value">{Math.round(percentage)}%</strong>
    </div>
  );
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
