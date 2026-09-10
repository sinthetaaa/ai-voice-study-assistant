import { useRef, type CSSProperties } from "react";

import type { ConceptGraph } from "../lib/studyloop-api";

type StudySidebarProps = {
  mastery: number;

  coverage: number;

  coverageAuthoritative?: boolean;
  coveredCoreConceptCount?: number;

  totalCoreConceptCount?: number;

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
  coverageAuthoritative = false,
  coveredCoreConceptCount,
  totalCoreConceptCount,
  sessionNumber = 1,
  currentConceptId,
  conceptGraph,
  conceptFlow,
}: StudySidebarProps) {
  const safeMastery = clampPercentage(mastery);
  const safeCoverage = clampPercentage(coverage);
  const displayCoverage = coverageAuthoritative ? safeCoverage : 0;

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
  const flowNodes = buildConceptFlowNodes(graph);

  const flowShellRef = useRef<HTMLSpanElement | null>(null);
  const currentConceptRef = useRef<HTMLSpanElement | null>(null);

  const centerCurrentConcept = () => {
    requestAnimationFrame(() => {
      const shell = flowShellRef.current;
      const current = currentConceptRef.current;

      if (!shell || !current) {
        return;
      }

      const targetTop =
        current.offsetTop - shell.clientHeight / 2 + current.clientHeight / 2;

      shell.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "auto",
      });
    });
  };

  return (
    <span
      className="concept-flow-hover-trigger"
      onMouseEnter={centerCurrentConcept}
      onFocusCapture={centerCurrentConcept}
    >
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
          <span className="concept-path-shell" ref={flowShellRef}>
            <span className="concept-path-fade concept-path-fade-top" />

            <span className="concept-path-list">
              <span className="concept-path-line" />
              {flowNodes.map((node) => {
                const isCurrent = node.id === currentConceptId;

                const isSessionConcept = sessionConceptIds.includes(node.id);

                return (
                  <span
                    key={node.id}
                    ref={isCurrent ? currentConceptRef : undefined}
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
): ConceptGraph["nodes"] {
  if (!graph || graph.nodes.length === 0) {
    return [];
  }

  /*
   * Preserve the Study Pack's concept order.
   *
   * The current concept is centered when the learner opens
   * Concept Flow. Earlier concepts therefore remain above it,
   * while later concepts remain below it.
   */
  return graph.nodes;
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
