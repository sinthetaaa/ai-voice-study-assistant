"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import VoiceOrb from "../../components/VoiceOrb";

const RAPID_VIVA_POOL = [
  "What is the main idea behind the topic you have just studied?",

  "Explain one important concept from the material in your own words.",

  "What is one key relationship between two ideas in the uploaded material?",

  "What is the most important principle you would need to remember to explain this topic correctly?",
];

export default function RapidVivaPage() {
  const router =
    useRouter();

  const [
    question,
    setQuestion,
  ] =
    useState("");

  const [
    recording,
    setRecording,
  ] =
    useState(false);

  const [
    answered,
    setAnswered,
  ] =
    useState(false);

  useEffect(() => {
    /*
     * Every new Rapid Viva
     * begins from the base.
     *
     * No previous question.
     * No previous progress.
     * No previous mastery.
     */

    const randomIndex =
      Math.floor(
        Math.random() *
          RAPID_VIVA_POOL.length,
      );

    setQuestion(
      RAPID_VIVA_POOL[
        randomIndex
      ],
    );

    setRecording(false);

    setAnswered(false);
  }, []);

  function handleVoiceOrb() {
    if (!recording) {
      setRecording(true);

      return;
    }

    setRecording(false);

    setAnswered(true);
  }

  function nextQuestion() {
    let randomIndex =
      Math.floor(
        Math.random() *
          RAPID_VIVA_POOL.length,
      );

    if (
      RAPID_VIVA_POOL.length >
      1
    ) {
      while (
        RAPID_VIVA_POOL[
          randomIndex
        ] ===
        question
      ) {
        randomIndex =
          Math.floor(
            Math.random() *
              RAPID_VIVA_POOL.length,
          );
      }
    }

    setQuestion(
      RAPID_VIVA_POOL[
        randomIndex
      ],
    );

    setAnswered(false);

    setRecording(false);

    /*
     * Real version:
     *
     * backend evaluates
     * every answer.
     *
     * if mastery not achieved:
     * -> adaptive next question
     *
     * if mastery achieved:
     * -> final viva analysis
     */
  }

  return (
    <main className="app-page">
      <div className="app-background" />

      <div className="app-shell">
        <header className="app-header">
          <button
            className="wordmark"
            onClick={() =>
              router.push("/")
            }
          >
            StudyLoop
          </button>

          <span className="viva-session-label">
            RAPID VIVA
          </span>

          <button
            className="exit-session"
            onClick={() =>
              router.push("/")
            }
          >
            Exit Viva
          </button>
        </header>

        <section className="viva-question-page">
          <div className="viva-status">
            <p className="section-kicker">
              RAPID VIVA
            </p>

            <span>
              Fresh adaptive session
            </span>
          </div>

          <div className="viva-question-center">
            <h1>
              {question}
            </h1>

            {!answered && (
              <>
                <VoiceOrb
                  recording={
                    recording
                  }
                  onClick={
                    handleVoiceOrb
                  }
                />

                <p className="voice-instruction">
                  {!recording
                    ? "Tap to answer."
                    : "Listening. Tap the orb again when your answer is complete."}
                </p>
              </>
            )}

            {answered && (
              <div className="viva-answer-received">
                <span className="viva-received-dot" />

                <p>
                  Answer received.
                </p>

                <button
                  className="next-button rapid-next"
                  onClick={
                    nextQuestion
                  }
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

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12h13" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}
