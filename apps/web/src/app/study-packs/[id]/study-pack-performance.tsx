"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  StudyLoopApiError,
  studyLoopApi,
  type StudyPackPerformanceCoreConcept,
  type StudyPackPerformanceResult,
} from "../../../lib/studyloop-api";

import styles from "./study-pack-performance.module.css";

type StudyPackPerformanceProps = {
  studyPackId: string;

  reloadKey: number;
};

export default function StudyPackPerformance({
  studyPackId,
  reloadKey,
}: StudyPackPerformanceProps) {
  const [performance, setPerformance] =
    useState<StudyPackPerformanceResult | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPerformance() {
      setLoading(true);
      setError(null);

      try {
        const result = await studyLoopApi.getStudyPackPerformance(studyPackId);

        if (!cancelled) {
          setPerformance(result);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        console.error(loadError);

        setError(
          loadError instanceof StudyLoopApiError
            ? loadError.message
            : "Could not load performance.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPerformance();

    return () => {
      cancelled = true;
    };
  }, [studyPackId, reloadKey, retryKey]);

  if (loading) {
    return (
      <section className={styles.section}>
        <PerformanceHeading />

        <div className={`${styles.loadingCard} glass-card`}>
          <span className="small-spinner" />

          <span>Loading learning performance…</span>
        </div>
      </section>
    );
  }

  if (!performance || error) {
    return (
      <section className={styles.section}>
        <PerformanceHeading />

        <div className={`${styles.errorCard} glass-card`}>
          <div>
            <strong>Performance is unavailable.</strong>

            <p>
              {error ?? "StudyLoop could not load this performance snapshot."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setRetryKey((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const masteryPercentage = toPercentage(performance.mastery.averageMastery);

  const answerQualityPercentage = toPercentage(
    performance.answerQuality.averageScore,
  );

  return (
    <section className={styles.section}>
      <PerformanceHeading />

      <div className={styles.metrics}>
        <PerformanceMetric
          label="AVERAGE MASTERY"
          value={masteryPercentage === null ? "—" : `${masteryPercentage}%`}
          detail={`${performance.mastery.evaluatedConceptCount} of ${performance.mastery.activeConceptCount} active concepts evaluated`}
        />

        <PerformanceMetric
          label="ANSWER QUALITY"
          value={
            answerQualityPercentage === null
              ? "—"
              : `${answerQualityPercentage}%`
          }
          detail={`${performance.answerQuality.evaluatedAnswerCount} evaluated ${
            performance.answerQuality.evaluatedAnswerCount === 1
              ? "answer"
              : "answers"
          }`}
        />

        <PerformanceMetric
          label="MASTERY ATTEMPTS"
          value={String(performance.mastery.totalMasteryAttempts)}
          detail={`${formatEvidence(
            performance.mastery.totalEvidenceWeight,
          )} weighted evidence`}
        />

        <PerformanceMetric
          label="DUE FOR REVIEW"
          value={String(performance.mastery.dueReviewCount)}
          detail={`${performance.mastery.scheduledReviewCount} scheduled ${
            performance.mastery.scheduledReviewCount === 1
              ? "review"
              : "reviews"
          }`}
        />
      </div>

      <div className={styles.insights}>
        <InsightCard
          eyebrow="STRONGEST CORE CONCEPT"
          concept={performance.hierarchy.strongestCoreConcept}
        />

        <InsightCard
          eyebrow="CURRENT FOCUS"
          concept={performance.hierarchy.weakestCoreConcept}
          focus
        />
      </div>

      <div className={styles.dashboardGrid}>
        <article className={`${styles.trendCard} glass-card`}>
          <div className={styles.cardHeading}>
            <div>
              <span>SESSION PERFORMANCE</span>

              <h3>Answer quality over time.</h3>
            </div>

            <strong>
              {performance.sessionTrend.length}{" "}
              {performance.sessionTrend.length === 1 ? "point" : "points"}
            </strong>
          </div>

          {performance.sessionTrend.length === 0 ? (
            <EmptyPanel>
              Session performance will appear after evaluated answers are
              recorded.
            </EmptyPanel>
          ) : (
            <div className={styles.chart}>
              <div className={styles.chartGuide}>
                <span>100%</span>
                <span>50%</span>
                <span>0%</span>
              </div>

              <div className={styles.chartPlot}>
                {performance.sessionTrend.map((point) => {
                  const percentage =
                    toPercentage(point.answerQuality.averageScore) ?? 0;

                  const label =
                    point.kind === "NORMAL"
                      ? `S${point.sessionNumber ?? "—"}`
                      : "R";

                  return (
                    <div className={styles.chartPoint} key={point.sessionId}>
                      <div
                        className={styles.barTrack}
                        title={`${label}: ${percentage}%`}
                      >
                        <span
                          style={{
                            height: `${Math.max(4, percentage)}%`,
                          }}
                        />
                      </div>

                      <strong>{percentage}%</strong>

                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </article>

        <article className={`${styles.answerCard} glass-card`}>
          <div className={styles.cardHeading}>
            <div>
              <span>ANSWER OUTCOMES</span>

              <h3>Evaluated responses.</h3>
            </div>
          </div>

          <div className={styles.answerBreakdown}>
            <OutcomeRow
              label="Correct"
              value={performance.answerQuality.correctness.correct}
              total={performance.answerQuality.evaluatedAnswerCount}
            />

            <OutcomeRow
              label="Partial"
              value={performance.answerQuality.correctness.partial}
              total={performance.answerQuality.evaluatedAnswerCount}
            />

            <OutcomeRow
              label="Incorrect"
              value={performance.answerQuality.correctness.incorrect}
              total={performance.answerQuality.evaluatedAnswerCount}
            />
          </div>
        </article>
      </div>

      <article className={`${styles.topicCard} glass-card`}>
        <div className={styles.cardHeading}>
          <div>
            <span>TOPIC PERFORMANCE</span>

            <h3>Mastery across your curriculum.</h3>
          </div>

          <strong>
            {performance.hierarchy.topics.length}{" "}
            {performance.hierarchy.topics.length === 1 ? "topic" : "topics"}
          </strong>
        </div>

        {performance.hierarchy.topics.length === 0 ? (
          <EmptyPanel>Topic performance is not available yet.</EmptyPanel>
        ) : (
          <div className={styles.topicList}>
            {performance.hierarchy.topics.map((topic) => {
              const percentage = toPercentage(topic.averageMastery);

              return (
                <div className={styles.topicRow} key={topic.id}>
                  <div className={styles.topicCopy}>
                    <strong>{topic.name}</strong>

                    <span>
                      {topic.evaluatedCoreConceptCount} of{" "}
                      {topic.coreConceptCount} core concepts evaluated
                    </span>
                  </div>

                  <div className={styles.topicProgress}>
                    <div>
                      <span
                        style={{
                          width: `${percentage ?? 0}%`,
                        }}
                      />
                    </div>

                    <strong>
                      {percentage === null ? "—" : `${percentage}%`}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className={`${styles.coreCard} glass-card`}>
        <div className={styles.cardHeading}>
          <div>
            <span>CORE CONCEPTS</span>

            <h3>Where your mastery currently stands.</h3>
          </div>

          <strong>
            {performance.hierarchy.coreConcepts.length}{" "}
            {performance.hierarchy.coreConcepts.length === 1
              ? "concept"
              : "concepts"}
          </strong>
        </div>

        {performance.hierarchy.coreConcepts.length === 0 ? (
          <EmptyPanel>
            Core Concept performance is not available yet.
          </EmptyPanel>
        ) : (
          <div className={styles.coreGrid}>
            {performance.hierarchy.coreConcepts.map((concept) => (
              <CoreConceptCard concept={concept} key={concept.id} />
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function PerformanceHeading() {
  return (
    <div className={styles.heading}>
      <div>
        <p className="section-kicker">PERFORMANCE</p>

        <h2>How your learning is evolving.</h2>
      </div>

      <p>Lifetime mastery, answer quality and session trends.</p>
    </div>
  );
}

function PerformanceMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className={`${styles.metricCard} glass-card`}>
      <span>{label}</span>

      <strong>{value}</strong>

      <p>{detail}</p>
    </article>
  );
}

function InsightCard({
  eyebrow,
  concept,
  focus = false,
}: {
  eyebrow: string;

  concept:
    StudyPackPerformanceResult["hierarchy"]["strongestCoreConcept"] | null;

  focus?: boolean;
}) {
  return (
    <article
      className={`${styles.insightCard} glass-card ${
        focus ? styles.focusInsight : ""
      }`}
    >
      <span>{eyebrow}</span>

      {concept ? (
        <>
          <h3>{concept.name}</h3>

          <p>{concept.topicName}</p>

          <div className={styles.insightFooter}>
            <strong>{formatPercentage(concept.averageMastery)}</strong>

            <span>
              {concept.evaluatedAtomicConceptCount}/{concept.atomicConceptCount}{" "}
              atomics evaluated
            </span>
          </div>
        </>
      ) : (
        <p className={styles.insightEmpty}>
          Not enough comparative evidence yet.
        </p>
      )}
    </article>
  );
}

function OutcomeRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const ratio = total === 0 ? 0 : Math.round((value / total) * 100);

  return (
    <div className={styles.outcomeRow}>
      <div>
        <span>{label}</span>

        <strong>{value}</strong>
      </div>

      <div className={styles.outcomeTrack}>
        <span
          style={{
            width: `${ratio}%`,
          }}
        />
      </div>

      <small>{ratio}%</small>
    </div>
  );
}

function CoreConceptCard({
  concept,
}: {
  concept: StudyPackPerformanceCoreConcept;
}) {
  const percentage = toPercentage(concept.averageMastery);

  return (
    <div className={styles.coreConcept}>
      <div className={styles.coreConceptHeading}>
        <div>
          <span>{concept.topicName}</span>

          <h4>{concept.name}</h4>
        </div>

        <strong>{percentage === null ? "—" : `${percentage}%`}</strong>
      </div>

      <div className={styles.coreConceptTrack}>
        <span
          style={{
            width: `${percentage ?? 0}%`,
          }}
        />
      </div>

      <div className={styles.coreMeta}>
        <span>
          {concept.evaluatedAtomicConceptCount}/{concept.atomicConceptCount}{" "}
          atomics evaluated
        </span>

        <span>
          {concept.totalAttemptCount}{" "}
          {concept.totalAttemptCount === 1 ? "attempt" : "attempts"}
        </span>
      </div>
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className={styles.emptyPanel}>{children}</div>;
}

function toPercentage(score: number | null): number | null {
  if (score === null) {
    return null;
  }

  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function formatPercentage(score: number) {
  return `${toPercentage(score) ?? 0}%`;
}

function formatEvidence(evidenceWeight: number) {
  return Number.isInteger(evidenceWeight)
    ? String(evidenceWeight)
    : evidenceWeight.toFixed(2);
}
