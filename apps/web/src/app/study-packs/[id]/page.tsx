"use client";

import { useCallback, useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import {
  StudyLoopApiError,
  StudyPackProgressHistorySession,
  StudyPackProgressResult,
  studyLoopApi,
} from "../../../lib/studyloop-api";

import StudyPackManagement from "./study-pack-management";
import StudyPackPerformance from "./study-pack-performance";

export default function StudyPackProgressPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const studyPackId = params.id;

  const [progress, setProgress] = useState<StudyPackProgressResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handleStudyPackChanged =
    useCallback(() => {
      setReloadKey(
        (current) => current + 1,
      );
    }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      setLoadError(null);

      try {
        const result = await studyLoopApi.getStudyPackProgress(studyPackId);

        if (!cancelled) {
          setProgress(result);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(error);

        if (error instanceof StudyLoopApiError) {
          setLoadError(error.message);
        } else {
          setLoadError("Could not load this Study Pack.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProgress();

    return () => {
      cancelled = true;
    };
  }, [studyPackId, reloadKey]);

  async function openNormalSession() {
    if (!progress || launching) {
      return;
    }

    const action = progress.normalStudy.primaryAction;

    setLaunching(true);
    setLaunchError(null);

    try {
      /*
       * Resume is navigation-only.
       *
       * Do not POST a second Normal session when the backend
       * already owns an ACTIVE sitting.
       */
      if (action.type === "RESUME_NORMAL_SESSION") {
        router.push(`/study?sessionId=${encodeURIComponent(action.sessionId)}`);

        return;
      }

      const session = await studyLoopApi.startStudySession(
        progress.studyPack.id,
      );

      router.push(`/study?sessionId=${encodeURIComponent(session.sessionId)}`);
    } catch (error) {
      console.error(error);

      if (error instanceof StudyLoopApiError) {
        setLaunchError(error.message);
      } else {
        setLaunchError("Could not open the study session.");
      }

      setLaunching(false);
    }
  }

  if (loading) {
    return (
      <main className="study-pack-detail-page">
        <DetailBackground />

        <div className="study-pack-detail-shell">
          <DetailHeader onHome={() => router.push("/#my-studies")} />

          <div className="study-pack-detail-loading glass-card">
            <span className="small-spinner" />
            <span>Loading Study Pack…</span>
          </div>
        </div>
      </main>
    );
  }

  if (!progress || loadError) {
    return (
      <main className="study-pack-detail-page">
        <DetailBackground />

        <div className="study-pack-detail-shell">
          <DetailHeader onHome={() => router.push("/#my-studies")} />

          <div className="study-pack-detail-failure glass-card">
            <p className="section-kicker">STUDY PACK</p>

            <h1>Could not load this Study Pack.</h1>

            <p>{loadError ?? "The Study Pack is unavailable."}</p>

            <div className="study-pack-detail-failure-actions">
              <button
                className="primary-pill"
                onClick={() => {
                  setLoading(true);
                  setReloadKey((current) => current + 1);
                }}
              >
                Try Again
              </button>

              <button
                className="study-pack-detail-secondary"
                onClick={() => router.push("/#my-studies")}
              >
                Back to My Studies
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const coveragePercentage =
    progress.coverage.authoritative && progress.coverage.percentage !== null
      ? Math.max(0, Math.min(100, progress.coverage.percentage))
      : null;

  const activeSession = progress.normalStudy.activeSession;
  const action = progress.normalStudy.primaryAction;

  const actionLabel =
    action.type === "RESUME_NORMAL_SESSION"
      ? `Resume Session ${action.sessionNumber}`
      : `Start Session ${action.sessionNumber}`;

  const activeTargetPercentage =
    activeSession && activeSession.progress.targetQuestionCount > 0
      ? Math.min(
          100,
          Math.round(
            (activeSession.progress.answeredQuestionCount /
              activeSession.progress.targetQuestionCount) *
              100,
          ),
        )
      : 0;

  return (
    <main className="study-pack-detail-page">
      <DetailBackground />

      <div className="study-pack-detail-shell">
        <DetailHeader onHome={() => router.push("/#my-studies")} />

        <section className="study-pack-detail-hero">
          <div className="study-pack-detail-hero-copy">
            <p className="section-kicker">STUDY PACK</p>

            <h1>{progress.studyPack.name}</h1>

            {progress.studyPack.description && (
              <p className="study-pack-detail-description">
                {progress.studyPack.description}
              </p>
            )}

            <p className="study-pack-detail-last-studied">
              {progress.lastStudiedAt
                ? `Last studied ${formatDateTime(progress.lastStudiedAt)}`
                : "Not studied yet"}
            </p>
          </div>

          <div className="study-pack-detail-hero-action">
            <button
              className="primary-pill study-pack-detail-primary-action"
              disabled={launching}
              onClick={() => void openNormalSession()}
            >
              {launching ? "Opening…" : actionLabel}

              {!launching && <ArrowIcon />}
            </button>

            {launchError && (
              <p className="study-pack-detail-inline-error">{launchError}</p>
            )}
          </div>
        </section>

        <section className="study-pack-detail-overview-grid">
          <article className="study-pack-detail-overview-card glass-card">
            <div className="study-pack-detail-card-heading">
              <span>STUDY PACK COVERAGE</span>

              <strong>
                {coveragePercentage === null
                  ? "Preparing…"
                  : `${progress.coverage.percentage}%`}
              </strong>
            </div>

            <div
              className="study-pack-detail-coverage-track"
              aria-hidden="true"
            >
              <span
                style={{
                  width: `${coveragePercentage ?? 0}%`,
                }}
              />
            </div>

            <p>
              {progress.coverage.authoritative
                ? `${progress.coverage.coveredCoreConceptCount} of ${progress.coverage.totalCoreConceptCount} core concepts covered`
                : "Curriculum coverage is still being prepared."}
            </p>
          </article>

          <article className="study-pack-detail-overview-card glass-card">
            <div className="study-pack-detail-card-heading">
              <span>NORMAL STUDY</span>

              <strong>{progress.normalStudy.completedSessionCount}</strong>
            </div>

            <p>
              completed{" "}
              {progress.normalStudy.completedSessionCount === 1
                ? "session"
                : "sessions"}{" "}
              · {progress.normalStudy.sessionCount} total Normal{" "}
              {progress.normalStudy.sessionCount === 1 ? "session" : "sessions"}
            </p>
          </article>

          <article className="study-pack-detail-overview-card glass-card">
            <div className="study-pack-detail-card-heading">
              <span>NEXT ACTION</span>

              <strong>Session {action.sessionNumber}</strong>
            </div>

            <p>
              {action.type === "RESUME_NORMAL_SESSION"
                ? "Continue the active bounded sitting."
                : "Begin the next bounded Normal Study sitting."}
            </p>
          </article>
        </section>

        <StudyPackPerformance
          studyPackId={studyPackId}
          reloadKey={reloadKey}
        />

        <StudyPackManagement
          studyPackId={studyPackId}
          onStudyPackChanged={
            handleStudyPackChanged
          }
        />

        {activeSession && (
          <section className="study-pack-detail-current-section">
            <div className="study-pack-detail-section-heading">
              <div>
                <p className="section-kicker">CURRENT SESSION</p>
                <h2>Session {activeSession.sessionNumber}</h2>
              </div>

              <span className="study-pack-detail-active-badge">ACTIVE</span>
            </div>

            <article className="study-pack-current-session glass-card">
              <div className="study-pack-current-progress-heading">
                <span>BOUND SESSION PROGRESS</span>

                <strong>
                  {activeSession.progress.answeredQuestionCount} /{" "}
                  {activeSession.progress.targetQuestionCount}
                </strong>
              </div>

              <div
                className="study-pack-current-progress-track"
                aria-hidden="true"
              >
                <span
                  style={{
                    width: `${activeTargetPercentage}%`,
                  }}
                />
              </div>

              <div className="study-pack-current-metrics">
                <Metric
                  label="Questions answered"
                  value={activeSession.progress.answeredQuestionCount}
                />

                <Metric
                  label="Target"
                  value={activeSession.progress.targetQuestionCount}
                />

                <Metric
                  label="Hard cap"
                  value={activeSession.progress.maximumQuestionCount}
                />

                <Metric
                  label="Concepts completed"
                  value={activeSession.progress.completedConceptCount}
                />
              </div>

              {activeSession.progress.targetReached &&
                !activeSession.progress.maximumReached && (
                  <p className="study-pack-current-note">
                    Target reached. Adaptive remediation or retesting may
                    continue within the{" "}
                    {activeSession.progress.maximumQuestionCount}
                    -question hard cap.
                  </p>
                )}
            </article>
          </section>
        )}

        <section className="study-pack-history-section">
          <div className="study-pack-detail-section-heading">
            <div>
              <p className="section-kicker">SESSION HISTORY</p>
              <h2>Your previous sittings.</h2>
            </div>

            <span className="study-pack-history-count">
              {progress.history.length}{" "}
              {progress.history.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {progress.history.length === 0 ? (
            <div className="study-pack-history-empty glass-card">
              <p>No session history yet.</p>

              <span>
                Your Normal Study and Review history will appear here after you
                begin studying.
              </span>
            </div>
          ) : (
            <div className="study-pack-history-list">
              {progress.history.map((session) => (
                <HistorySession key={session.sessionId} session={session} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DetailHeader({ onHome }: { onHome: () => void }) {
  return (
    <header className="study-pack-detail-header">
      <button className="wordmark" onClick={onHome}>
        StudyLoop
      </button>

      <button className="study-pack-detail-secondary" onClick={onHome}>
        Back to My Studies
      </button>
    </header>
  );
}

function HistorySession({
  session,
}: {
  session: StudyPackProgressHistorySession;
}) {
  const title =
    session.kind === "NORMAL"
      ? `Session ${session.sessionNumber ?? "—"}`
      : "Review";

  return (
    <details
      className="study-pack-history-session glass-card"
      open={session.status === "ACTIVE"}
    >
      <summary>
        <div className="study-pack-history-summary-main">
          <div>
            <span className="study-pack-history-kind">{session.kind}</span>

            <h3>{title}</h3>
          </div>

          <span
            className={`study-pack-history-status study-pack-history-status-${session.status.toLowerCase()}`}
          >
            {formatStatus(session.status)}
          </span>
        </div>

        <div className="study-pack-history-summary-metrics">
          <span>
            <strong>{session.answeredQuestionCount}</strong>
            questions
          </span>

          <span>
            <strong>
              {session.completedConceptCount}/{session.conceptCount}
            </strong>
            concepts
          </span>

          <span>
            <strong>{formatDateTime(session.startedAt)}</strong>
            started
          </span>
        </div>
      </summary>

      <div className="study-pack-history-body">
        {session.reviewRequiredCount > 0 && (
          <p className="study-pack-history-review-note">
            {session.reviewRequiredCount}{" "}
            {session.reviewRequiredCount === 1
              ? "concept requires"
              : "concepts require"}{" "}
            review.
          </p>
        )}

        {session.concepts.length === 0 ? (
          <p className="study-pack-history-no-concepts">
            No concept progress was recorded for this session.
          </p>
        ) : (
          <div className="study-pack-history-concepts">
            {session.concepts.map((concept) => (
              <article
                className="study-pack-history-concept"
                key={concept.conceptId}
              >
                <div className="study-pack-history-concept-heading">
                  <div>
                    <span>
                      {formatStatus(concept.difficulty)} · Importance{" "}
                      {concept.importance}
                    </span>

                    <h4>{concept.name}</h4>
                  </div>

                  <strong>{formatMastery(concept.mastery.score)}</strong>
                </div>

                <div className="study-pack-history-concept-meta">
                  <span>{formatStatus(concept.status)}</span>

                  <span>
                    {concept.mastery.attemptCount}{" "}
                    {concept.mastery.attemptCount === 1
                      ? "attempt"
                      : "attempts"}
                  </span>

                  {concept.reviewRequired && <span>Review required</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="study-pack-current-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatMastery(score: number) {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12h13" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}

function DetailBackground() {
  return (
    <div className="study-pack-detail-background" aria-hidden="true">
      <div className="study-pack-detail-glow study-pack-detail-glow-a" />
      <div className="study-pack-detail-glow study-pack-detail-glow-b" />
    </div>
  );
}
