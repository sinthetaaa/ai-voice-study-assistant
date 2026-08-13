"use client";

import { Suspense, useEffect, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import StudySidebar from "../../components/StudySidebar";
import VoiceOrb from "../../components/VoiceOrb";

import {
  QuestionSpeechResult,
  StudyLoopApiError,
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

        if (!cancelled) {
          setSession(state);

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
  onHearAnalysis,
  onNext,
  onExit,
}: {
  result: VoiceAnswerResult;

  progress: number;

  audioBlocked: boolean;

  onHearAnalysis: () => void;

  onNext: () => void;

  onExit: () => void;
}) {
  const evaluation = result.answer.evaluation;

  const updatedSession = result.answer.session;

  const answeredConcept = updatedSession.conceptFlow.find(
    (concept) => concept.id === evaluation.conceptId,
  );

  const masteryPercent =
    (answeredConcept?.mastery.score ??
      result.answer.learningStep?.mastery.score ??
      0) * 100;

  const hasNextQuestion =
    updatedSession.status === "ACTIVE" &&
    Boolean(updatedSession.currentQuestion);

  const remediation = result.answer.learningStep?.remediation;

  const showScore = progress >= 0.12;

  const showTranscript = progress >= 0.25;

  const showFeedback = progress >= 0.42;

  const showDiagnostics = progress >= 0.62;

  const showRemediation = progress >= 0.78;

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
          <section className="analysis-panel">
            <div className="analysis-heading">
              <div>
                <p className="section-kicker">TOPIC</p>

                <h1>
                  {result.answer.learningStep?.conceptName ??
                    answeredConcept?.name ??
                    "Study Analysis"}
                </h1>

                <span className="small-chip">{evaluation.questionType}</span>
              </div>

              <div className="analysis-actions">
                {audioBlocked && (
                  <button
                    className="hear-analysis-button"
                    onClick={onHearAnalysis}
                  >
                    <SpeakerIcon />
                    Hear Analysis
                  </button>
                )}

                <button
                  className="next-button"
                  disabled={!analysisFinished}
                  onClick={hasNextQuestion ? onNext : onExit}
                >
                  {hasNextQuestion ? "Next Question" : "Finish Session"}

                  <ArrowIcon />
                </button>
              </div>
            </div>

            <div className="analysis-content real-analysis">
              <div className="analysis-title-row analysis-reveal visible">
                <div>
                  <p className="section-kicker">ANSWER ANALYSIS</p>

                  <h2>{correctnessTitle(evaluation.correctness)}</h2>
                </div>

                <div
                  className={`correctness-badge correctness-${evaluation.correctness.toLowerCase()}`}
                >
                  {evaluation.correctness}
                </div>
              </div>

              <div
                className={
                  showScore ? "analysis-reveal visible" : "analysis-reveal"
                }
              >
                <div className="answer-score-card glass-card">
                  <div>
                    <span>Answer score</span>

                    <strong>{Math.round(evaluation.score * 100)}%</strong>
                  </div>

                  <div className="answer-score-track">
                    <span
                      style={{
                        width: `${Math.round(evaluation.score * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                className={
                  showTranscript ? "analysis-reveal visible" : "analysis-reveal"
                }
              >
                <section className="transcription-card glass-card">
                  <p className="section-kicker">WHAT STUDYLOOP HEARD</p>

                  <p>
                    &ldquo;
                    {result.transcription.text}
                    &rdquo;
                  </p>
                </section>
              </div>

              <div
                className={
                  showFeedback ? "analysis-reveal visible" : "analysis-reveal"
                }
              >
                <section className="feedback-card glass-card">
                  <p className="section-kicker">FEEDBACK</p>

                  <p>{evaluation.feedback}</p>
                </section>
              </div>

              <div
                className={
                  showDiagnostics
                    ? "analysis-reveal visible"
                    : "analysis-reveal"
                }
              >
                <div className="diagnostic-grid">
                  <DiagnosticCard
                    title="MISSING POINTS"
                    items={evaluation.missingPoints}
                    emptyText="No important missing points were identified."
                  />

                  <DiagnosticCard
                    title="MISCONCEPTIONS"
                    items={evaluation.misconceptions}
                    emptyText="No misconception was identified."
                  />
                </div>
              </div>

              {remediation && (
                <div
                  className={
                    showRemediation
                      ? "analysis-reveal visible"
                      : "analysis-reveal"
                  }
                >
                  <section className="remediation-card glass-card">
                    <p className="section-kicker">
                      FOCUS BEFORE THE NEXT QUESTION
                    </p>

                    <p className="remediation-explanation">
                      {remediation.explanation}
                    </p>

                    {remediation.keyTakeaways.length > 0 && (
                      <div className="takeaway-list">
                        {remediation.keyTakeaways.map((takeaway) => (
                          <div key={takeaway} className="takeaway">
                            <span>✓</span>

                            <p>{takeaway}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </section>

          <StudySidebar
            mastery={masteryPercent}
            conceptFlow={updatedSession.conceptFlow}
          />
        </div>
      </div>
    </main>
  );
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
