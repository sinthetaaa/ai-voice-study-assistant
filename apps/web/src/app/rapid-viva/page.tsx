"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import VoiceOrb from "../../components/VoiceOrb";

const RAPID_VIVA_POOL = [
  "What is the main idea behind the topic you have just studied?",

  "Explain one important concept from the material in your own words.",

  "What is one key relationship between two ideas in the uploaded material?",

  "What is the most important principle you would need to remember to explain this topic correctly?",
];

export default function RapidVivaPage() {
  const router = useRouter();

  const [question, setQuestion] = useState("");

  const [answered, setAnswered] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuestion(randomQuestion());

    setAnswered(false);
  }, []);

  function completeAnswer(_audio: Blob) {
    setAnswered(true);
  }

  function nextQuestion() {
    setQuestion(randomQuestion(question));

    setAnswered(false);

    setError(null);
  }

  return (
    <main className="app-page">
      <div className="app-background" />

      <div className="app-shell">
        <header className="app-header">
          <button className="wordmark" onClick={() => router.push("/")}>
            StudyLoop
          </button>

          <span className="viva-session-label">RAPID VIVA</span>

          <button className="exit-session" onClick={() => router.push("/")}>
            Exit Viva
          </button>
        </header>

        <section className="viva-question-page">
          <div className="viva-status">
            <p className="section-kicker">RAPID VIVA</p>

            <span>Adaptive session</span>
          </div>

          <div className="viva-question-center">
            <h1>{question}</h1>

            {!answered && (
              <>
                <VoiceOrb
                  onRecordingComplete={completeAnswer}
                  onError={setError}
                />

                <p className="voice-instruction">
                  Tap once to answer. Tap again when you&apos;re finished.
                </p>

                {error && <p className="study-inline-error">{error}</p>}
              </>
            )}

            {answered && (
              <div className="viva-answer-received">
                <span className="viva-received-dot" />

                <p>Answer received.</p>

                <button
                  className="next-button rapid-next"
                  onClick={nextQuestion}
                >
                  Next Question
                  <ArrowIcon />
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function randomQuestion(previous?: string) {
  let candidate =
    RAPID_VIVA_POOL[Math.floor(Math.random() * RAPID_VIVA_POOL.length)];

  while (previous && candidate === previous && RAPID_VIVA_POOL.length > 1) {
    candidate =
      RAPID_VIVA_POOL[Math.floor(Math.random() * RAPID_VIVA_POOL.length)];
  }

  return candidate;
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12h13" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}
