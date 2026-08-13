"use client";

import { useEffect, useState } from "react";

const QUESTION =
  "What specific physical law is incorporated into the neural network architecture when using Physics-Informed Neural Networks (PINNs) for adaptive retinal image enhancement?";

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!recording) {
      return;
    }

    const timer = window.setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [recording]);

  function toggleRecording() {
    if (recording) {
      setRecording(false);
      return;
    }

    setSeconds(0);
    setRecording(true);
  }

  const formattedTime = `00:${String(seconds).padStart(2, "0")}`;

  return (
    <main className="studyloop-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <div className="noise-layer" />
      <div className="grid-layer" />

      <aside className="sidebar glass-panel">
        <div>
          <div className="brand">
            <div className="brand-mark">
              <span />
              <span />
              <span />
            </div>

            <div>
              <p className="brand-name">StudyLoop</p>
              <p className="brand-caption">adaptive intelligence</p>
            </div>
          </div>

          <nav className="navigation">
            <button className="nav-item active">
              <IconSpark />
              <span>Study</span>
              <span className="nav-indicator" />
            </button>

            <button className="nav-item">
              <IconLayers />
              <span>Library</span>
            </button>

            <button className="nav-item">
              <IconGraph />
              <span>Progress</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-card-top">
              <span className="status-dot" />
              <span>AI systems online</span>
            </div>

            <div className="system-line">
              <span>Voice</span>
              <strong>Ryan</strong>
            </div>

            <div className="system-line">
              <span>Mode</span>
              <strong>Adaptive</strong>
            </div>
          </div>

          <button className="profile">
            <div className="profile-avatar">S</div>

            <div className="profile-copy">
              <strong>Study session</strong>
              <span>Focused mode</span>
            </div>

            <span className="profile-more">•••</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              ACTIVE STUDY SESSION
            </div>

            <h1>
              Train your understanding.
              <span> Not your memory.</span>
            </h1>
          </div>

          <div className="topbar-actions">
            <div className="live-chip">
              <span className="live-wave">
                <i />
                <i />
                <i />
                <i />
              </span>

              Voice coach ready
            </div>

            <button className="icon-button">
              <IconSettings />
            </button>
          </div>
        </header>

        <div className="study-layout">
          <section className="study-card glass-panel">
            <div className="study-card-top">
              <div>
                <p className="tiny-label">CURRENT CONCEPT</p>

                <h2>Physics-Informed Neural Networks</h2>

                <div className="concept-meta">
                  <span className="tag purple">Advanced</span>
                  <span className="tag dark">PINNs</span>
                  <span className="tag dark">Recall</span>
                </div>
              </div>

              <div className="question-number">
                <span>03</span>
                <small>/ 03</small>
              </div>
            </div>

            <div className="progress-track">
              <div className="progress-fill" />
              <span className="progress-glow" />
            </div>

            <div className="question-area">
              <div className="question-topline">
                <span>QUESTION</span>
                <span className="question-difficulty">
                  <i />
                  EASY
                </span>
              </div>

              <p className="question-text">{QUESTION}</p>

              <div className="voice-zone">
                <div className="voice-copy">
                  <p>
                    {recording
                      ? "I'm listening."
                      : "Answer naturally. Take your time."}
                  </p>

                  <span>
                    {recording
                      ? "Press finish when your answer is complete."
                      : "You have up to 60 seconds for this recall question."}
                  </span>
                </div>

                <div className={`voice-stage ${recording ? "recording" : ""}`}>
                  <div className="voice-halo halo-one" />
                  <div className="voice-halo halo-two" />
                  <div className="voice-halo halo-three" />

                  <button
                    className="voice-orb"
                    onClick={toggleRecording}
                    aria-label={
                      recording ? "Finish answer" : "Start voice answer"
                    }
                  >
                    <div className="orb-surface">
                      {recording ? <VoiceBars /> : <IconMic />}
                    </div>

                    <div className="orb-shine" />
                  </button>
                </div>

                <button
                  className={`record-control ${recording ? "active" : ""}`}
                  onClick={toggleRecording}
                >
                  <span
                    className={
                      recording ? "record-stop" : "record-dot"
                    }
                  />

                  {recording ? "Finish answer" : "Start voice answer"}

                  {recording && (
                    <span className="record-timer">{formattedTime}</span>
                  )}
                </button>

                <p className="shortcut">
                  <span>SPACE</span>
                  to record
                </p>
              </div>
            </div>
          </section>

          <aside className="insights-column">
            <section className="mastery-card glass-panel">
              <div className="panel-heading">
                <div>
                  <p className="tiny-label">CONCEPT MASTERY</p>
                  <h3>Learning signal</h3>
                </div>

                <span className="silver-chip">LIVE</span>
              </div>

              <div className="mastery-visual">
                <div className="mastery-ring">
                  <div className="mastery-ring-inner">
                    <strong>36</strong>
                    <span>%</span>
                    <small>mastery</small>
                  </div>
                </div>

                <div className="mastery-glow" />
              </div>

              <div className="mastery-stats">
                <div>
                  <span>Evidence</span>
                  <strong>0.75</strong>
                </div>

                <div>
                  <span>Attempts</span>
                  <strong>1</strong>
                </div>

                <div>
                  <span>Next</span>
                  <strong>Recall</strong>
                </div>
              </div>
            </section>

            <section className="session-card glass-panel">
              <div className="panel-heading">
                <div>
                  <p className="tiny-label">SESSION FLOW</p>
                  <h3>Your loop</h3>
                </div>

                <span className="session-count">2 / 3</span>
              </div>

              <div className="timeline">
                <TimelineItem
                  state="done"
                  index="01"
                  title="Clinical validation"
                  subtitle="Completed"
                />

                <TimelineItem
                  state="review"
                  index="02"
                  title="DR detection"
                  subtitle="Review scheduled"
                />

                <TimelineItem
                  state="active"
                  index="03"
                  title="Physics-Informed NNs"
                  subtitle="Studying now"
                />
              </div>
            </section>

            <section className="coach-card">
              <div className="coach-orbit">
                <div className="coach-core" />
              </div>

              <div>
                <p className="tiny-label">VOICE COACH</p>
                <strong>Ryan is ready.</strong>
                <span>Responses play at 1.07×</span>
              </div>

              <span className="coach-wave">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function TimelineItem({
  state,
  index,
  title,
  subtitle,
}: {
  state: "done" | "review" | "active";
  index: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className={`timeline-item ${state}`}>
      <div className="timeline-rail">
        <div className="timeline-node">
          {state === "done" ? "✓" : index}
        </div>
      </div>

      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

function VoiceBars() {
  return (
    <span className="voice-bars">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function IconMic() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.5a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5.5a4 4 0 0 0 4 4Z" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function IconGraph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20V7" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.2 19.3a1.7 1.7 0 0 0-1.8.4l-.07.06-2.83-2.83.07-.06A1.7 1.7 0 0 0 4 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2v-4h.1A1.7 1.7 0 0 0 3.7 8.2a1.7 1.7 0 0 0-.4-1.8l-.06-.07L6.07 3.5l.06.07A1.7 1.7 0 0 0 8 4a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4v.1A1.7 1.7 0 0 0 14.8 3.7a1.7 1.7 0 0 0 1.8-.4l.07-.06 2.83 2.83-.07.06A1.7 1.7 0 0 0 19 8a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.3v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}
