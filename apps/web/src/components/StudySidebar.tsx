"use client";

import type { SessionConcept } from "../lib/studyloop-api";

type StudySidebarProps = {
  mastery: number;

  conceptFlow: SessionConcept[];
};

export default function StudySidebar({
  mastery,
  conceptFlow,
}: StudySidebarProps) {
  const safeMastery = Math.max(0, Math.min(100, Math.round(mastery)));

  return (
    <aside className="study-sidebar">
      <section className="mastery-card glass-card">
        <p className="section-kicker">CONCEPT MASTERY</p>

        <div
          className="mastery-ring"
          style={{
            background: `
              conic-gradient(
                #f5f5f2 0deg,
                #f5f5f2 ${safeMastery * 3.6}deg,
                rgba(255,255,255,0.06) ${safeMastery * 3.6}deg,
                rgba(255,255,255,0.06) 360deg
              )
            `,
          }}
        >
          <div className="mastery-ring-inner">
            <strong>{safeMastery}</strong>

            <span>%</span>
          </div>
        </div>
      </section>

      <section className="session-flow glass-card">
        <p className="section-kicker">SESSION FLOW</p>

        {conceptFlow.length === 0 ? (
          <div className="flow-empty">Session flow is preparing.</div>
        ) : (
          conceptFlow.map((concept) => (
            <FlowItem
              key={concept.id}
              status={concept.status}
              label={concept.name}
            />
          ))
        )}
      </section>
    </aside>
  );
}

function FlowItem({
  status,
  label,
}: {
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REVIEW_REQUIRED";

  label: string;
}) {
  const className =
    status === "IN_PROGRESS"
      ? "active"
      : status === "COMPLETED"
        ? "complete"
        : status === "REVIEW_REQUIRED"
          ? "review"
          : "waiting";

  return (
    <div className={`flow-item ${className}`}>
      <span className="flow-node">{status === "COMPLETED" ? "✓" : ""}</span>

      <span className="flow-label">{label}</span>
    </div>
  );
}
