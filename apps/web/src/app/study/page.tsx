"use client";

import { Suspense, useEffect, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import StudySidebar from "../../components/StudySidebar";
import StudyPdfViewer, {
  type MaterialStudyPoint,
} from "../../components/StudyPdfViewer";
import VoiceOrb from "../../components/VoiceOrb";

import {
  AnalysisSource,
  ConceptGraph,
  QuestionSpeechResult,
  StudyLoopApiError,
  StudyPackCoverage,
  StudySession,
  VoiceAnswerResult,
  studyLoopApi,
} from "../../lib/studyloop-api";

type StudyView = "question" | "submitting" | "analysis";

type QuestionVoiceState =
  "loading" | "speaking" | "blocked" | "ready" | "failed";

const PLAYBACK_RATE = 1.07;

export default function StudyPage() {
  return (
    <Suspense fallback={<SessionLoading />}>
      <StudySessionPage />
    </Suspense>
  );
}

function StudySessionPage() {
  const router = useRouter();

  const searchParams = useSearchParams();

  const sessionId = searchParams.get("sessionId");

  const [session, setSession] = useState<StudySession | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [coverage, setCoverage] = useState<StudyPackCoverage | null>(null);

  const [conceptGraph, setConceptGraph] = useState<ConceptGraph | null>(null);

  const [view, setView] = useState<StudyView>("question");

  const [voiceResult, setVoiceResult] = useState<VoiceAnswerResult | null>(
    null,
  );

  const [questionVoiceState, setQuestionVoiceState] =
    useState<QuestionVoiceState>("loading");

  const [visibleQuestionWords, setVisibleQuestionWords] = useState(0);

  const [analysisProgress, setAnalysisProgress] = useState(0);

  const [analysisAudioBlocked, setAnalysisAudioBlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioUrlRef = useRef<string | null>(null);

  const animationFrameRef = useRef<number | null>(null);

  const spokenQuestionIdRef = useRef<string | null>(null);

  const pendingQuestionSpeechRef = useRef<QuestionSpeechResult | null>(null);

  const pendingAnalysisAudioRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("No StudySession was supplied.");

      setLoading(false);

      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const state = await studyLoopApi.getStudySession(sessionId!);

        let coverageState: StudyPackCoverage | null = null;

        let conceptGraphState: ConceptGraph | null = null;

        const [coverageResult, graphResult] = await Promise.allSettled([
          studyLoopApi.getStudyPackCoverage(state.studyPackId),

          studyLoopApi.getConceptGraph(state.studyPackId),
        ]);

        if (coverageResult.status === "fulfilled") {
          coverageState = coverageResult.value;
        } else {
          console.warn(
            "Could not load Study Pack coverage:",
            coverageResult.reason,
          );
        }

        if (graphResult.status === "fulfilled") {
          conceptGraphState = graphResult.value;
        } else {
          console.warn("Could not load Concept Graph:", graphResult.reason);
        }

        if (!cancelled) {
          setSession(state);

          setCoverage(coverageState);

          setConceptGraph(conceptGraphState);

          setError(null);
        }
      } catch (caught) {
        if (cancelled) {
          return;
        }

        setError(
          getErrorMessage(caught, "Could not load the StudyLoop session."),
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (
      !sessionId ||
      !session ||
      view !== "question" ||
      !session.currentQuestion
    ) {
      return;
    }

    const questionId = session.currentQuestion.id;

    if (spokenQuestionIdRef.current === questionId) {
      return;
    }

    spokenQuestionIdRef.current = questionId;

    void prepareAndSpeakQuestion(sessionId, session.currentQuestion.prompt);
  }, [sessionId, session, view]);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  async function prepareAndSpeakQuestion(
    activeSessionId: string,
    fallbackText: string,
  ) {
    stopAudio();

    pendingQuestionSpeechRef.current = null;

    setVisibleQuestionWords(0);

    setQuestionVoiceState("loading");

    setError(null);

    try {
      const result =
        await studyLoopApi.speakStudySessionQuestion(activeSessionId);

      if (result.speech.status !== "READY") {
        showQuestionWithoutVoice(fallbackText);

        return;
      }

      try {
        await playQuestionSpeech(result);
      } catch (caught) {
        console.warn("Automatic question playback was blocked:", caught);

        pendingQuestionSpeechRef.current = result;

        setVisibleQuestionWords(0);

        setQuestionVoiceState("blocked");
      }
    } catch (caught) {
      console.error(caught);

      showQuestionWithoutVoice(fallbackText);

      setError(
        "Ryan could not speak this question, so StudyLoop has shown it in full.",
      );
    }
  }

  async function playQuestionSpeech(result: QuestionSpeechResult) {
    if (result.speech.status !== "READY") {
      showQuestionWithoutVoice(result.text);

      return;
    }

    pendingQuestionSpeechRef.current = null;

    setVisibleQuestionWords(0);

    setQuestionVoiceState("speaking");

    await playSpeech(
      result.speech.audioBase64,

      (progress) => {
        const total = wordCount(result.text);

        setVisibleQuestionWords(Math.min(total, Math.ceil(progress * total)));
      },

      () => {
        setVisibleQuestionWords(wordCount(result.text));

        setQuestionVoiceState("ready");
      },
    );
  }

  async function hearBlockedQuestion() {
    const pending = pendingQuestionSpeechRef.current;

    if (!pending) {
      return;
    }

    setError(null);

    try {
      await playQuestionSpeech(pending);
    } catch (caught) {
      console.error(caught);

      showQuestionWithoutVoice(pending.text);

      setError(
        "Question audio could not be played. The full question is available below.",
      );
    }
  }

  function showQuestionWithoutVoice(text: string) {
    setVisibleQuestionWords(wordCount(text));

    setQuestionVoiceState("failed");
  }

  async function submitVoiceAnswer(wavAudio: Blob) {
    if (!sessionId) {
      return;
    }

    stopAudio();

    setError(null);

    setAnalysisAudioBlocked(false);

    pendingAnalysisAudioRef.current = null;

    setView("submitting");

    try {
      const result = await studyLoopApi.answerStudySessionByVoice(
        sessionId,
        wavAudio,
      );

      try {
        const coverageState = await studyLoopApi.getStudyPackCoverage(
          result.answer.session.studyPackId,
        );

        setCoverage(coverageState);
      } catch (coverageError) {
        /*
         * Coverage is supplemental progress information.
         * A temporary refresh failure must not interrupt
         * the answer/evaluation flow.
         */
        console.warn("Could not refresh Study Pack coverage:", coverageError);
      }

      setVoiceResult(result);

      setSession(result.answer.session);

      setAnalysisProgress(0);

      setView("analysis");

      if (result.speech.status === "READY") {
        pendingAnalysisAudioRef.current = result.speech.audioBase64;

        try {
          await playAnalysisSpeech(result.speech.audioBase64);
        } catch (caught) {
          console.warn("Automatic analysis playback was blocked:", caught);

          setAnalysisAudioBlocked(true);

          setAnalysisProgress(1);
        }
      } else {
        setAnalysisProgress(1);
      }
    } catch (caught) {
      setError(
        getErrorMessage(
          caught,
          "StudyLoop could not process this voice answer.",
        ),
      );

      setView("question");
    }
  }

  async function playAnalysisSpeech(audioBase64: string) {
    setAnalysisAudioBlocked(false);

    setAnalysisProgress(0);

    await playSpeech(
      audioBase64,

      (progress) => {
        setAnalysisProgress(progress);
      },

      () => {
        setAnalysisProgress(1);

        pendingAnalysisAudioRef.current = null;
      },
    );
  }

  async function hearBlockedAnalysis() {
    const audioBase64 = pendingAnalysisAudioRef.current;

    if (!audioBase64) {
      return;
    }

    try {
      await playAnalysisSpeech(audioBase64);
    } catch (caught) {
      console.error(caught);

      setAnalysisProgress(1);
    }
  }

  async function playSpeech(
    audioBase64: string,
    onProgress: (progress: number) => void,
    onComplete: () => void,
  ) {
    stopAudio();

    const url = base64WavToUrl(audioBase64);

    audioUrlRef.current = url;

    const audio = new Audio(url);

    audio.playbackRate = PLAYBACK_RATE;

    if ("preservesPitch" in audio) {
      audio.preservesPitch = true;
    }

    audioRef.current = audio;

    let completed = false;

    function finish() {
      if (completed) {
        return;
      }

      completed = true;

      onProgress(1);

      onComplete();

      cleanupAudioUrl();
    }

    function updateProgress() {
      if (audio.duration && Number.isFinite(audio.duration)) {
        const progress = Math.max(
          0,
          Math.min(1, audio.currentTime / audio.duration),
        );

        onProgress(progress);
      }

      if (!audio.ended) {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    }

    audio.onended = finish;

    audio.onerror = () => {
      cleanupAudioUrl();
    };

    try {
      await audio.play();

      updateProgress();
    } catch (error) {
      stopAudio();

      throw error;
    }
  }

  function stopAudio() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);

      animationFrameRef.current = null;
    }

    const audio = audioRef.current;

    if (audio) {
      audio.pause();

      audio.currentTime = 0;

      audioRef.current = null;
    }

    cleanupAudioUrl();
  }

  function cleanupAudioUrl() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);

      audioUrlRef.current = null;
    }
  }

  function nextQuestion() {
    stopAudio();

    if (!voiceResult) {
      return;
    }

    const updated = voiceResult.answer.session;

    setSession(updated);

    setVoiceResult(null);

    setAnalysisProgress(0);

    setAnalysisAudioBlocked(false);

    pendingAnalysisAudioRef.current = null;

    setVisibleQuestionWords(0);

    setQuestionVoiceState("loading");

    pendingQuestionSpeechRef.current = null;

    spokenQuestionIdRef.current = null;

    setView("question");
  }

  if (loading) {
    return <SessionLoading />;
  }

  if (error && !session) {
    return <SessionFailure message={error} onHome={() => router.push("/")} />;
  }

  if (!session) {
    return (
      <SessionFailure
        message="The session could not be loaded."
        onHome={() => router.push("/")}
      />
    );
  }

  if (view === "analysis" && voiceResult) {
    return (
      <AnalysisScreen
        result={voiceResult}
        progress={analysisProgress}
        audioBlocked={analysisAudioBlocked}
        coverage={coverage}
        conceptGraph={conceptGraph}
        onHearAnalysis={hearBlockedAnalysis}
        onNext={nextQuestion}
        onExit={() => router.push("/")}
      />
    );
  }

  if (
    session.status === "COMPLETED" ||
    !session.currentConcept ||
    !session.currentQuestion
  ) {
    return <SessionComplete onHome={() => router.push("/")} />;
  }

  const masteryPercent = session.currentConcept.mastery.score * 100;

  const questionWords = session.currentQuestion.prompt.trim().split(/\s+/);

  const visibleQuestion = questionWords
    .slice(0, visibleQuestionWords)
    .join(" ");

  const questionFinished =
    questionVoiceState === "ready" || questionVoiceState === "failed";

  return (
    <main className="app-page">
      <div className="app-background" />

      <div className="app-shell">
        <header className="app-header">
          <button className="wordmark" onClick={() => router.push("/")}>
            StudyLoop
          </button>

          <button className="exit-session" onClick={() => router.push("/")}>
            Exit Session
          </button>
        </header>

        <div className="study-page-layout">
          <section className="question-panel">
            <div className="question-header">
              <div>
                <p className="section-kicker">TOPIC</p>

                <h1>{session.currentConcept.name}</h1>

                <span className="small-chip">
                  {session.currentConcept.difficulty}
                </span>
              </div>

              <span className="question-difficulty">
                {session.currentQuestion.difficulty}
              </span>
            </div>

            <div className="adaptive-line">
              <span
                style={{
                  width: `${Math.max(0, Math.min(100, masteryPercent))}%`,
                }}
              />
            </div>

            <div className="question-body">
              <div className="question-state-line">
                <p className="section-kicker">{session.currentQuestion.type}</p>

                <span
                  className={
                    questionFinished
                      ? "assistant-speaking-label complete"
                      : "assistant-speaking-label"
                  }
                >
                  {questionVoiceState === "loading"
                    ? "Preparing voice…"
                    : questionVoiceState === "speaking"
                      ? "Ryan is asking"
                      : questionVoiceState === "blocked"
                        ? "Voice ready"
                        : "Your turn"}
                </span>
              </div>

              <h2 className="spoken-question">
                {visibleQuestion}

                {!questionFinished && questionVoiceState !== "blocked" && (
                  <span className="speech-cursor">|</span>
                )}
              </h2>

              {view === "submitting" ? (
                <div className="voice-processing">
                  <div className="voice-processing-orb">
                    <span />
                  </div>

                  <p>Understanding your answer…</p>
                </div>
              ) : questionVoiceState === "blocked" ? (
                <button
                  className="hear-question-button"
                  onClick={hearBlockedQuestion}
                >
                  <SpeakerIcon />
                  Hear Question
                </button>
              ) : questionFinished ? (
                <>
                  <VoiceOrb
                    onRecordingComplete={submitVoiceAnswer}
                    onError={setError}
                  />

                  <p className="voice-instruction">
                    Tap once to answer. Tap again when you&apos;re finished.
                  </p>
                </>
              ) : (
                <div className="question-listening-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              )}

              {error && <p className="study-inline-error">{error}</p>}
            </div>
          </section>

          <StudySidebar
            mastery={masteryPercent}
            coverage={coverage?.percentage ?? 0}
            testedConceptCount={coverage?.testedConceptCount}
            totalConceptCount={coverage?.totalConceptCount}
            sessionNumber={session.sessionNumber ?? 1}
            currentConceptId={session.currentConcept?.id ?? null}
            conceptGraph={conceptGraph}
            conceptFlow={session.conceptFlow}
          />
        </div>
      </div>
    </main>
  );
}

function AnalysisScreen({
  result,
  progress,
  audioBlocked,
  coverage,
  conceptGraph,
  onHearAnalysis,
  onNext,
  onExit,
}: {
  result: VoiceAnswerResult;

  progress: number;

  audioBlocked: boolean;

  coverage: StudyPackCoverage | null;

  conceptGraph: ConceptGraph | null;

  onHearAnalysis: () => void;

  onNext: () => void;

  onExit: () => void;
}) {
  const evaluation = result.answer.evaluation;

  const updatedSession = result.answer.session;

  const [analysisSources, setAnalysisSources] = useState<AnalysisSource[]>([]);

  const [analysisSourcesLoading, setAnalysisSourcesLoading] = useState(true);

  const [analysisSourcesError, setAnalysisSourcesError] = useState<
    string | null
  >(null);

  const [openSource, setOpenSource] = useState<AnalysisDocumentSource | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAnalysisSources() {
      setAnalysisSourcesLoading(true);

      setAnalysisSourcesError(null);

      try {
        const sourceResult = await studyLoopApi.getStudySessionAnalysisSources(
          updatedSession.sessionId,
          evaluation.attemptId,
        );

        if (cancelled) {
          return;
        }

        setAnalysisSources(sourceResult.sources);
      } catch (caught) {
        if (cancelled) {
          return;
        }

        console.warn("Could not load answer-analysis sources:", caught);

        setAnalysisSources([]);

        setAnalysisSourcesError(
          "StudyLoop could not load the supporting material.",
        );
      } finally {
        if (!cancelled) {
          setAnalysisSourcesLoading(false);
        }
      }
    }

    void loadAnalysisSources();

    return () => {
      cancelled = true;
    };
  }, [updatedSession.sessionId, evaluation.attemptId]);

  const analysisDocuments = groupAnalysisSourcesByDocument(analysisSources);

  const answeredConcept = updatedSession.conceptFlow.find(
    (concept) => concept.id === evaluation.conceptId,
  );

  const masteryPercent =
    (answeredConcept?.mastery.score ??
      result.answer.learningStep?.mastery.score ??
      0) * 100;

  const scorePercent = Math.round(evaluation.score * 100);

  const hasNextQuestion =
    updatedSession.status === "ACTIVE" &&
    Boolean(updatedSession.currentQuestion);

  const remediation = result.answer.learningStep?.remediation;

  const keyPointers = [...(remediation?.keyTakeaways ?? [])];

  if (keyPointers.length === 0 && remediation?.focusPoints) {
    keyPointers.push(...remediation.focusPoints);
  }

  /*
   * A weak/incorrect answer should never end up with an
   * empty Key Pointers card just because remediation did
   * not return explicit takeaways.
   *
   * Missing points already describe the essential ideas
   * the learner needs to include in a stronger answer.
   */
  if (keyPointers.length === 0 && evaluation.missingPoints.length > 0) {
    keyPointers.push(...evaluation.missingPoints.slice(0, 3));
  }

  /*
   * Deduplicate overlapping remediation/missing points.
   */
  const uniqueKeyPointers = Array.from(
    new Map(
      keyPointers.map((pointer) => [
        pointer.trim().toLowerCase(),
        pointer.trim(),
      ]),
    ).values(),
  ).filter(Boolean);

  const materialStudyPoints = buildMaterialStudyPoints({
    missingPoints: evaluation.missingPoints,
    misconceptions: evaluation.misconceptions,
    keyPointers,
    remediationExplanation: remediation?.explanation ?? null,
  });

  const displayKeyPointers = Array.from(
    new Map(
      [
        ...keyPointers,
        ...(keyPointers.length === 0 ? evaluation.missingPoints : []),
      ]
        .map((pointer) => pointer.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((pointer) => [pointer.toLowerCase(), pointer]),
    ).values(),
  ).slice(0, 3);

  const analysisFinished = progress >= 0.98;

  return (
    <main className="app-page">
      <div className="app-background" />

      <div className="app-shell">
        <header className="app-header">
          <button className="wordmark" onClick={onExit}>
            StudyLoop
          </button>

          <div className="analysis-speaking-state">
            <span
              className={
                analysisFinished
                  ? "analysis-voice-dot complete"
                  : "analysis-voice-dot"
              }
            />

            <span>
              {audioBlocked
                ? "Analysis voice ready"
                : analysisFinished
                  ? "Analysis complete"
                  : "Ryan is explaining"}
            </span>
          </div>

          <button className="exit-session" onClick={onExit}>
            Exit Session
          </button>
        </header>

        <div className="study-page-layout">
          <section className="analysis-dashboard">
            <div className="analysis-dashboard-topbar">
              <div>
                <p className="section-kicker">ANSWER ANALYSIS</p>

                <h1>
                  {result.answer.learningStep?.conceptName ??
                    answeredConcept?.name ??
                    "Study Analysis"}
                </h1>

                <div className="analysis-topic-meta">
                  <span className="small-chip">{evaluation.questionType}</span>

                  <span
                    className={`analysis-result-pill analysis-result-${evaluation.correctness.toLowerCase()}`}
                  >
                    {evaluation.correctness}
                  </span>
                </div>
              </div>

              {audioBlocked && (
                <button
                  className="hear-analysis-button"
                  onClick={onHearAnalysis}
                >
                  <SpeakerIcon />
                  Hear Analysis
                </button>
              )}
            </div>

            <div className="analysis-metric-grid">
              <section className="analysis-metric-card analysis-score-card">
                <div className="analysis-card-label">ANSWER SCORE</div>

                <div className="analysis-score-row">
                  <strong>
                    {scorePercent}
                    <span>/100</span>
                  </strong>

                  <span
                    className={`analysis-score-status analysis-score-status-${evaluation.correctness.toLowerCase()}`}
                  >
                    {correctnessTitle(evaluation.correctness)}
                  </span>
                </div>

                <div className="analysis-score-track-v2">
                  <div
                    style={{
                      width: `${scorePercent}%`,
                    }}
                  />
                </div>
              </section>

              <section className="analysis-metric-card analysis-mastery-card">
                <div className="analysis-card-label">SESSION MASTERY</div>

                <div className="analysis-mastery-number">
                  {Math.round(masteryPercent)}%
                </div>

                <p>Updated from the evidence in this answer.</p>
              </section>
            </div>

            <section className="analysis-response-card">
              <div className="analysis-card-label">
                YOUR ANSWER (TRANSCRIPTION)
              </div>

              <p>
                &ldquo;
                {result.transcription.text}
                &rdquo;
              </p>
            </section>

            <div className="analysis-diagnostic-dashboard">
              <section className="analysis-insight-card analysis-positive-card">
                <div className="analysis-insight-heading">
                  <span className="analysis-insight-icon">
                    {evaluation.correctness === "INCORRECT" ? "−" : "✓"}
                  </span>

                  <span>
                    {evaluation.correctness === "INCORRECT"
                      ? "CORRECT ELEMENTS"
                      : "WHAT YOU GOT RIGHT"}
                  </span>
                </div>

                <p className="analysis-feedback-copy">
                  {evaluation.correctness === "INCORRECT"
                    ? "No correct elements were identified in this answer."
                    : evaluation.feedback}
                </p>
              </section>

              <section className="analysis-insight-card analysis-missed-card">
                <div className="analysis-insight-heading">
                  <span className="analysis-insight-icon">−</span>

                  <span>WHAT YOU MISSED</span>
                </div>

                {evaluation.missingPoints.length > 0 ? (
                  <div className="analysis-point-list">
                    {evaluation.missingPoints.map((item) => (
                      <div className="analysis-point" key={item}>
                        <span />

                        <p>{item}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="analysis-empty-copy">
                    No important missing points were identified.
                  </p>
                )}
              </section>
            </div>

            <section className="analysis-misconception-card">
              <div className="analysis-insight-heading">
                <span className="analysis-warning-icon">!</span>

                <span>MISCONCEPTIONS</span>
              </div>

              {evaluation.misconceptions.length > 0 ? (
                <div className="analysis-point-list">
                  {evaluation.misconceptions.map((item) => (
                    <div className="analysis-point" key={item}>
                      <span />

                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analysis-empty-copy">
                  No misconception was detected in this answer.
                </p>
              )}
            </section>

            <section className="analysis-key-pointers">
              <div className="analysis-section-heading">
                <div>
                  <p className="section-kicker">KEY POINTERS</p>

                  <h2>What a stronger answer should contain</h2>
                </div>
              </div>

              {displayKeyPointers.length > 0 ? (
                <div className="analysis-pointer-list analysis-pointer-checklist">
                  {displayKeyPointers.map((pointer, index) => (
                    <div
                      className={`analysis-pointer-item analysis-pointer-color-${
                        index % 3
                      }`}
                      key={`${index}-${pointer}`}
                    >
                      <span className="analysis-pointer-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <p>{pointer}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="analysis-pointer-complete">
                  <span>✓</span>

                  <p>
                    Your answer already covered the essential points for this
                    question.
                  </p>
                </div>
              )}
            </section>

            <section className="analysis-material-section">
              <div className="analysis-section-heading analysis-material-heading">
                <div>
                  <h2>Revisit the evidence behind this concept</h2>
                </div>
              </div>

              <div className="analysis-source-placeholder-grid">
                {analysisSourcesLoading ? (
                  <>
                    <SourceCardSkeleton />
                    <SourceCardSkeleton />
                  </>
                ) : analysisSourcesError ? (
                  <div className="analysis-source-empty">
                    {analysisSourcesError}
                  </div>
                ) : analysisDocuments.length > 0 ? (
                  analysisDocuments.map((source, index) => (
                    <button
                      type="button"
                      className="analysis-source-card"
                      key={source.documentId}
                      onClick={() => setOpenSource(source)}
                    >
                      <SourcePreview source={source} />

                      <div className="analysis-source-card-copy">
                        <strong>
                          {formatAnalysisDocumentPages(source.evidenceSources)}
                          {" · "}
                          {source.documentName}
                        </strong>

                        <p>{cleanDisplayEvidence(source.excerpt)}</p>

                        <span className="analysis-source-open">
                          Open in document
                          <span aria-hidden="true">↗</span>
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="analysis-source-empty">
                    No supporting source passage was stored for this attempt.
                  </div>
                )}
              </div>
            </section>

            {openSource && (
              <SourceDocumentModal
                source={openSource}
                studyPoints={materialStudyPoints}
                onClose={() => setOpenSource(null)}
              />
            )}

            <div className="analysis-dashboard-footer">
              <div className="analysis-footer-note">
                <span
                  className={
                    analysisFinished
                      ? "analysis-voice-dot complete"
                      : "analysis-voice-dot"
                  }
                />

                <span>
                  {analysisFinished
                    ? "Ready to continue"
                    : "Ryan is still explaining"}
                </span>
              </div>

              <button
                className="next-button analysis-next-button"
                disabled={!analysisFinished}
                onClick={hasNextQuestion ? onNext : onExit}
              >
                {hasNextQuestion ? "Next Question" : "Finish Session"}

                <ArrowIcon />
              </button>
            </div>
          </section>

          <StudySidebar
            mastery={masteryPercent}
            coverage={coverage?.percentage ?? 0}
            testedConceptCount={coverage?.testedConceptCount}
            totalConceptCount={coverage?.totalConceptCount}
            sessionNumber={updatedSession.sessionNumber ?? 1}
            currentConceptId={updatedSession.currentConcept?.id ?? null}
            conceptGraph={conceptGraph}
            conceptFlow={updatedSession.conceptFlow}
          />
        </div>
      </div>
    </main>
  );
}

type AnalysisDocumentSource = AnalysisSource & {
  evidenceSources: AnalysisSource[];
};

function groupAnalysisSourcesByDocument(
  sources: AnalysisSource[],
): AnalysisDocumentSource[] {
  const grouped = new Map<string, AnalysisSource[]>();

  for (const source of sources) {
    const existing = grouped.get(source.documentId);

    if (existing) {
      existing.push(source);
    } else {
      grouped.set(source.documentId, [source]);
    }
  }

  return Array.from(grouped.values()).map((documentSources) => {
    const ordered = [...documentSources].sort((a, b) => {
      const pageA = a.pageNumber ?? Number.MAX_SAFE_INTEGER;

      const pageB = b.pageNumber ?? Number.MAX_SAFE_INTEGER;

      if (pageA !== pageB) {
        return pageA - pageB;
      }

      return a.unitIndex - b.unitIndex;
    });

    const first = ordered[0];

    return {
      ...first,

      pageNumber:
        ordered.find((source) => source.pageNumber !== null)?.pageNumber ??
        first.pageNumber,

      excerpt: ordered.map((source) => source.excerpt).join("\n\n"),

      evidenceSources: ordered,
    };
  });
}

function formatAnalysisDocumentPages(sources: AnalysisSource[]): string {
  const pages = Array.from(
    new Set(
      sources
        .map((source) => source.pageNumber)
        .filter((page): page is number => typeof page === "number"),
    ),
  ).sort((a, b) => a - b);

  if (pages.length === 0) {
    return "Source material";
  }

  if (pages.length === 1) {
    return `Page ${pages[0]}`;
  }

  if (pages.length <= 3) {
    return `Pages ${pages.join(", ")}`;
  }

  return `Pages ${pages[0]}–${pages[pages.length - 1]}`;
}

function SourcePreview({ source }: { source: AnalysisSource }) {
  const sourceUrl = buildAnalysisDocumentUrl(source);

  if (source.mimeType === "application/pdf") {
    return (
      <div className="analysis-source-preview-real">
        <iframe
          src={`${sourceUrl}#page=${
            source.pageNumber ?? 1
          }&toolbar=0&navpanes=0`}
          title={`${source.documentName} preview`}
          tabIndex={-1}
        />

        <div className="analysis-source-preview-shade" />

        <span className="analysis-source-page-chip">
          {source.pageNumber ? `PAGE ${source.pageNumber}` : "PDF"}
        </span>
      </div>
    );
  }

  return (
    <div className="analysis-source-preview-real analysis-source-generic-preview">
      <span />
      <span />
      <span />
      <span />

      <div className="analysis-source-page-chip">
        {source.unitLabel || source.unitKind}
      </div>
    </div>
  );
}

function SourceCardSkeleton() {
  return (
    <div className="analysis-source-card analysis-source-card-loading">
      <div className="analysis-source-preview">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="analysis-source-placeholder-copy">
        <strong>Loading source evidence…</strong>

        <span>Finding the exact material used for this answer.</span>
      </div>
    </div>
  );
}

function SourceDocumentModal({
  source,
  studyPoints,
  onClose,
}: {
  source: AnalysisDocumentSource;

  studyPoints: MaterialStudyPoint[];

  onClose: () => void;
}) {
  const sourceUrl = buildAnalysisDocumentUrl(source);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="analysis-document-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="analysis-document-modal analysis-study-document-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Review ${source.documentName}`}
      >
        <header className="analysis-document-modal-header">
          <div>
            <strong>{source.documentName}</strong>

            <span>
              {source.pageNumber
                ? `Page ${source.pageNumber}`
                : source.unitLabel}
            </span>
          </div>

          <button
            type="button"
            className="analysis-document-close"
            onClick={onClose}
            aria-label="Close source document"
          >
            ×
          </button>
        </header>

        <div className="analysis-document-modal-body">
          {source.mimeType === "application/pdf" ? (
            <StudyPdfViewer
              fileUrl={sourceUrl}
              initialPage={source.pageNumber ?? 1}
              evidenceSources={source.evidenceSources.map((evidence) => ({
                chunkId: evidence.chunkId,
                pageNumber: evidence.pageNumber ?? 1,
                excerpt: evidence.excerpt,
              }))}
              studyPoints={studyPoints}
            />
          ) : (
            <div className="analysis-document-unsupported">
              <p>
                Inline study review is currently available for PDF material.
              </p>

              <a href={sourceUrl} target="_blank" rel="noreferrer">
                Open original document ↗
              </a>
            </div>
          )}

          <aside className="analysis-document-evidence analysis-study-guide">
            <p className="section-kicker">WHAT TO STUDY HERE</p>

            <h2>Focus on these points</h2>

            <p className="analysis-study-guide-intro">
              These are the ideas this answer needs you to revisit.
            </p>

            <div className="analysis-study-guide-list">
              {studyPoints.length > 0 ? (
                studyPoints.map((point, index) => (
                  <article
                    className={`analysis-study-guide-card analysis-study-guide-color-${
                      point.colorIndex % 3
                    }`}
                    key={point.id}
                  >
                    <div className="analysis-study-guide-number">
                      {String(index + 1).padStart(2, "0")}
                    </div>

                    <div>
                      <span>{studyCategoryLabel(point.category)}</span>

                      <strong>{point.title}</strong>

                      <p>{point.explanation}</p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="analysis-study-guide-empty">
                  Review the highlighted evidence on this page.
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function buildMaterialStudyPoints({
  missingPoints,
  misconceptions,
  keyPointers,
  remediationExplanation,
}: {
  missingPoints: string[];

  misconceptions: string[];

  keyPointers: string[];

  remediationExplanation: string | null;
}): MaterialStudyPoint[] {
  type DraftPoint = {
    category: MaterialStudyPoint["category"];
    value: string;
  };

  const drafts: DraftPoint[] = [];

  const seen = new Set<string>();

  function addDraft(category: MaterialStudyPoint["category"], value: string) {
    const cleaned = cleanStudyText(value);

    if (!cleaned) {
      return;
    }

    const normalized = cleaned.toLowerCase();

    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);

    drafts.push({
      category,
      value: cleaned,
    });
  }

  for (const point of missingPoints) {
    addDraft("MISSED", point);
  }

  for (const misconception of misconceptions) {
    addDraft("MISCONCEPTION", misconception);
  }

  for (const pointer of keyPointers) {
    addDraft("KEY", pointer);
  }

  /*
   * Remediation tends to contain the fuller explanation
   * behind the short evaluation bullets.
   *
   * Keep its sentences available as elaboration material,
   * rather than showing the same short point twice.
   */
  const explanationSentences = splitStudySentences(
    remediationExplanation ?? "",
  );

  if (drafts.length < 2 && explanationSentences.length > 0) {
    for (const sentence of explanationSentences) {
      addDraft("KEY", sentence);

      if (drafts.length >= 5) {
        break;
      }
    }
  }

  const allContext = [
    ...missingPoints,
    ...misconceptions,
    ...keyPointers,
    ...explanationSentences,
  ]
    .map(cleanStudyText)
    .filter(Boolean);

  return drafts.slice(0, 6).map((draft, index) => {
    const title = makeStudyPointTitle(draft.value, draft.category);

    const explanation = buildStudyPointExplanation({
      point: draft.value,
      title,
      category: draft.category,
      remediationExplanation,
      context: allContext,
    });

    return {
      id: `${draft.category.toLowerCase()}-${index}`,

      category: draft.category,

      title,

      explanation,

      /*
       * Keep the original educational point as the
       * PDF search target. The elaborated UI description
       * should not affect source matching.
       */
      searchText: draft.value,

      colorIndex: index % 3,
    };
  });
}

function buildStudyPointExplanation({
  point,
  title,
  category,
  remediationExplanation,
  context,
}: {
  point: string;

  title: string;

  category: MaterialStudyPoint["category"];

  remediationExplanation: string | null;

  context: string[];
}): string {
  const pointTokens = studyTokens(point);

  const candidates = [
    ...splitStudySentences(remediationExplanation ?? ""),
    ...context,
  ]
    .map(cleanStudyText)
    .filter((candidate) => {
      if (!candidate) {
        return false;
      }

      const normalized = candidate.toLowerCase();

      const pointNormalized = point.toLowerCase();

      const titleNormalized = title.toLowerCase();

      /*
       * Don't repeat the title/point verbatim in the
       * description box.
       */
      return (
        normalized !== pointNormalized &&
        normalized !== titleNormalized &&
        !normalized.startsWith(titleNormalized)
      );
    });

  const ranked = candidates
    .map((candidate) => ({
      candidate,

      score: studyTokenOverlap(pointTokens, studyTokens(candidate)),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length > 0) {
    const best = ranked[0].candidate;

    /*
     * If the strongest sentence is genuinely more detailed,
     * use it directly.
     */
    if (best.length >= point.length + 12 || best.split(/\s+/).length >= 12) {
      return best;
    }
  }

  /*
   * Fallback explanations remain generic enough to work
   * for any uploaded subject, but explain why the learner
   * should care about the point instead of simply repeating it.
   */
  switch (category) {
    case "MISSED":
      return `Review how ${lowercaseStudyLead(
        point,
      )}. Focus on what it does, where it is used, and why that detail matters to the answer.`;

    case "MISCONCEPTION":
      return `Revisit this distinction carefully. The important part is understanding the correct relationship behind ${lowercaseStudyLead(
        point,
      )}, rather than memorizing the wording alone.`;

    default:
      return `Understand the idea behind ${lowercaseStudyLead(
        point,
      )}. Be able to explain its role and connect it back to the question in your own words.`;
  }
}

function splitStudySentences(value: string): string[] {
  const cleaned = cleanStudyText(value);

  if (!cleaned) {
    return [];
  }

  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map(cleanStudyText)
    .filter((sentence) => sentence.length >= 24);
}

function cleanStudyText(value: string): string {
  return value
    .replace(/<sup>(.*?)<\/sup>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_#`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function studyTokens(value: string): Set<string> {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "were",
    "with",
  ]);

  return new Set(
    cleanStudyText(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  );
}

function studyTokenOverlap(first: Set<string>, second: Set<string>): number {
  if (first.size === 0 || second.size === 0) {
    return 0;
  }

  let common = 0;

  for (const token of first) {
    if (second.has(token)) {
      common += 1;
    }
  }

  return common / first.size;
}

function lowercaseStudyLead(value: string): string {
  const cleaned = cleanStudyText(value)
    .replace(/[.!?]+$/, "")
    .trim();

  if (!cleaned) {
    return "this concept";
  }

  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function makeStudyPointTitle(
  value: string,
  category: MaterialStudyPoint["category"],
): string {
  let cleaned = cleanStudyText(value)
    .replace(/^(remember|understand|review|know|explain)\s+/i, "")
    .trim();

  /*
   * Keep the complete educational idea.
   *
   * Previously this function deliberately reduced the
   * title to ~7 words. That is why headings such as
   * "Fast-SLIC is the specific algorithm used for..."
   * were being cut off even though the CSS allowed wrapping.
   */
  cleaned = cleaned.replace(/[.!?]+$/, "").trim();

  if (!cleaned) {
    switch (category) {
      case "MISSED":
        return "Important missing point";

      case "MISCONCEPTION":
        return "Concept to clarify";

      default:
        return "Key idea";
    }
  }

  return sentenceCase(cleaned);
}

function sentenceCase(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function studyCategoryLabel(category: MaterialStudyPoint["category"]): string {
  switch (category) {
    case "MISSED":
      return "Missing point";

    case "MISCONCEPTION":
      return "Clarify this";

    default:
      return "Key idea";
  }
}

function cleanDisplayEvidence(value: string) {
  return value
    .replace(/<sup>.*?<\/sup>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_#`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAnalysisDocumentUrl(source: AnalysisSource) {
  /*
   * fileUrl comes from the API as an API-relative URL.
   *
   * StudyLoop currently runs the Nest API on port 4000.
   * When deployment configuration is introduced, this
   * should move into the shared frontend API-base helper.
   */
  return `http://localhost:4000${source.fileUrl}`;
}

function DiagnosticCard({
  title,
  items,
  emptyText,
}: {
  title: string;

  items: string[];

  emptyText: string;
}) {
  return (
    <section className="diagnostic-card glass-card">
      <p className="section-kicker">{title}</p>

      {items.length > 0 ? (
        <div className="diagnostic-items">
          {items.map((item) => (
            <div className="diagnostic-item" key={item}>
              <span />

              <p>{item}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="diagnostic-empty">{emptyText}</p>
      )}
    </section>
  );
}

function correctnessTitle(correctness: "CORRECT" | "PARTIAL" | "INCORRECT") {
  switch (correctness) {
    case "CORRECT":
      return "Strong answer.";

    case "PARTIAL":
      return "You’re close.";

    case "INCORRECT":
      return "There’s a gap to work on.";
  }
}

function SessionLoading() {
  return (
    <main className="app-page">
      <div className="app-background" />

      <div className="session-loading">
        <span />
      </div>
    </main>
  );
}

function SessionFailure({
  message,
  onHome,
}: {
  message: string;

  onHome: () => void;
}) {
  return (
    <main className="app-page">
      <div className="app-background" />

      <div className="app-shell">
        <div className="session-error-state">
          <p className="section-kicker">STUDY SESSION</p>

          <h1>Unable to open this session.</h1>

          <p>{message}</p>

          <button className="primary-pill" onClick={onHome}>
            Back Home
          </button>
        </div>
      </div>
    </main>
  );
}

function SessionComplete({ onHome }: { onHome: () => void }) {
  return (
    <main className="app-page">
      <div className="app-background" />

      <div className="app-shell">
        <div className="session-complete-state">
          <p className="section-kicker">SESSION COMPLETE</p>

          <h1>Study session complete.</h1>

          <button className="primary-pill" onClick={onHome}>
            Back Home
          </button>
        </div>
      </div>
    </main>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12h13" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 10v4h4l5 4V6l-5 4H5Z" />

      <path d="M17 9c1 1 1 5 0 6" />

      <path d="M19 7c3 3 3 7 0 10" />
    </svg>
  );
}

function wordCount(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function base64WavToUrl(audioBase64: string) {
  const binary = window.atob(audioBase64);

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], {
    type: "audio/wav",
  });

  return URL.createObjectURL(blob);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof StudyLoopApiError) {
    return error.message;
  }

  return fallback;
}
