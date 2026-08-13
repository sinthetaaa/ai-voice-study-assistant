"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import StudySidebar from "../../components/StudySidebar";
import VoiceOrb from "../../components/VoiceOrb";

import {
  StudyLoopApiError,
  StudySession,
  studyLoopApi,
} from "../../lib/studyloop-api";

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

  const [recording, setRecording] = useState(false);

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

        if (caught instanceof StudyLoopApiError) {
          setError(caught.message);
        } else {
          setError("Could not load the StudyLoop session.");
        }
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

  if (loading) {
    return <SessionLoading />;
  }

  if (error || !session) {
    return (
      <main className="app-page">
        <div className="app-background" />

        <div className="app-shell">
          <header className="app-header">
            <button className="wordmark" onClick={() => router.push("/")}>
              StudyLoop
            </button>
          </header>

          <div className="session-error-state">
            <p className="section-kicker">STUDY SESSION</p>

            <h1>Unable to open this session.</h1>

            <p>{error ?? "The session could not be loaded."}</p>

            <button className="primary-pill" onClick={() => router.push("/")}>
              Back Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (
    session.status === "COMPLETED" ||
    !session.currentConcept ||
    !session.currentQuestion
  ) {
    return (
      <main className="app-page">
        <div className="app-background" />

        <div className="app-shell">
          <header className="app-header">
            <button className="wordmark" onClick={() => router.push("/")}>
              StudyLoop
            </button>
          </header>

          <div className="session-complete-state">
            <p className="section-kicker">SESSION COMPLETE</p>

            <h1>Study session complete.</h1>

            <button className="primary-pill" onClick={() => router.push("/")}>
              Back Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  const masteryPercent = session.currentConcept.mastery.score * 100;

  function toggleRecording() {
    /*
     * At THIS milestone VoiceOrb provides
     * the real microphone visual state.
     *
     * The next milestone replaces this toggle
     * with MediaRecorder WAV capture and submits
     * it to:
     *
     * POST /study-sessions/:sessionId/voice-answer
     */
    setRecording((current) => !current);
  }

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
              <p className="section-kicker">{session.currentQuestion.type}</p>

              <h2>{session.currentQuestion.prompt}</h2>

              <VoiceOrb recording={recording} onClick={toggleRecording} />

              <p className="voice-instruction">
                {!recording
                  ? "Tap to answer."
                  : "Listening. Tap the orb again when your answer is complete."}
              </p>
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
