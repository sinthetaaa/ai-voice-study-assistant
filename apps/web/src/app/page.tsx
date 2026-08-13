"use client";

import { ChangeEvent, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  ApiDocument,
  ReadinessResult,
  StudyLoopApiError,
  studyLoopApi,
} from "../lib/studyloop-api";

const NAV_ITEMS = ["Home", "About", "Login", "Contact"] as const;

type NavItem = (typeof NAV_ITEMS)[number];

type UploadPhase = "EMPTY" | "UPLOADING" | "PROCESSING" | "READY" | "ERROR";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const MAX_FILES_PER_REQUEST = 10;

export default function Home() {
  const router = useRouter();

  const fileInput = useRef<HTMLInputElement | null>(null);

  const readinessPollId = useRef<number | null>(null);

  const [activeNav, setActiveNav] = useState<NavItem>("Home");

  const [studyPackId, setStudyPackId] = useState<string | null>(null);

  const [documents, setDocuments] = useState<ApiDocument[]>([]);

  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);

  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("EMPTY");

  const [uploadMessage, setUploadMessage] = useState(
    "Upload your material to begin.",
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [startingSession, setStartingSession] = useState(false);

  const activeIndex = NAV_ITEMS.indexOf(activeNav);

  const canStartStudy = Boolean(
    studyPackId &&
    readiness &&
    readiness.counts.activeConceptCount > 0 &&
    uploadPhase === "READY",
  );

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",

      block: "start",
    });
  }

  function navigate(item: NavItem) {
    setActiveNav(item);

    if (item === "Home") {
      scrollToSection("home");

      return;
    }

    if (item === "About") {
      scrollToSection("about");

      return;
    }

    if (item === "Contact") {
      scrollToSection("contact");

      return;
    }

    router.push("/login");
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (selectedFiles.length === 0) {
      return;
    }

    setErrorMessage(null);

    if (selectedFiles.length > MAX_FILES_PER_REQUEST) {
      setUploadPhase("ERROR");

      setErrorMessage(
        `You can upload up to ${MAX_FILES_PER_REQUEST} files at once.`,
      );

      return;
    }

    const oversized = selectedFiles.find((file) => file.size > MAX_FILE_BYTES);

    if (oversized) {
      setUploadPhase("ERROR");

      setErrorMessage(
        `${oversized.name} is larger than the 50 MB per-file limit.`,
      );

      return;
    }

    setUploadPhase("UPLOADING");

    setUploadMessage("Uploading your study material…");

    try {
      let activeStudyPackId = studyPackId;

      /*
       * The homepage creates one temporary study
       * pack for this new study launch.
       *
       * Subsequent uploads in the same page visit
       * are added to the same pack.
       */
      if (!activeStudyPackId) {
        const created = await studyLoopApi.createStudyPack(
          `Study Session ${new Date().toLocaleString()}`,
        );

        activeStudyPackId = created.id;

        setStudyPackId(created.id);
      }

      const uploaded = await studyLoopApi.uploadDocuments(
        activeStudyPackId,
        selectedFiles,
      );

      setDocuments((current) => {
        const byId = new Map(
          current.map((document) => [document.id, document]),
        );

        uploaded.documents.forEach((document) => {
          byId.set(document.id, document);
        });

        return Array.from(byId.values());
      });

      setUploadPhase("PROCESSING");

      setUploadMessage("StudyLoop is reading and preparing your material…");

      await pollUntilReady(activeStudyPackId);
    } catch (error) {
      handleError(error);
    }
  }

  async function pollUntilReady(activeStudyPackId: string) {
    stopReadinessPoll();

    const startedAt = Date.now();

    const timeoutMs = 5 * 60 * 1000;

    async function check() {
      try {
        const [pack, snapshot] = await Promise.all([
          studyLoopApi.getStudyPack(activeStudyPackId),

          studyLoopApi.getReadiness(activeStudyPackId),
        ]);

        setDocuments(pack.documents ?? []);

        setReadiness(snapshot);

        /*
         * startSession() now performs lazy
         * question preparation itself.
         *
         * Therefore the web app only needs to
         * wait until ingestion has produced at
         * least one READY-backed active concept.
         */
        if (snapshot.counts.activeConceptCount > 0) {
          setUploadPhase("READY");

          setUploadMessage("Your material is ready.");

          stopReadinessPoll();

          return;
        }

        const failedDocuments = (pack.documents ?? []).filter(
          (document) =>
            document.status === "FAILED" || document.status === "ERROR",
        );

        if (failedDocuments.length > 0) {
          setUploadPhase("ERROR");

          setErrorMessage("One or more documents could not be processed.");

          stopReadinessPoll();

          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          setUploadPhase("ERROR");

          setErrorMessage(
            "Document processing is taking longer than expected. Your files are still saved; try again shortly.",
          );

          stopReadinessPoll();

          return;
        }

        readinessPollId.current = window.setTimeout(check, 1500);
      } catch (error) {
        handleError(error);

        stopReadinessPoll();
      }
    }

    await check();
  }

  function stopReadinessPoll() {
    if (readinessPollId.current !== null) {
      window.clearTimeout(readinessPollId.current);

      readinessPollId.current = null;
    }
  }

  async function startStudy() {
    if (!studyPackId || !canStartStudy || startingSession) {
      return;
    }

    setStartingSession(true);

    setErrorMessage(null);

    try {
      /*
       * This is now a REAL fresh session.
       *
       * The backend:
       * - starts session mastery at 0
       * - chooses/persists a fresh starting concept
       * - prepares required questions lazily
       * - returns the real session state
       */
      const session = await studyLoopApi.startStudySession(studyPackId);

      router.push(`/study?sessionId=${encodeURIComponent(session.sessionId)}`);
    } catch (error) {
      handleError(error);

      setStartingSession(false);
    }
  }

  function handleError(error: unknown) {
    console.error(error);

    setUploadPhase("ERROR");

    if (error instanceof StudyLoopApiError) {
      setErrorMessage(error.message);

      return;
    }

    setErrorMessage(
      "Something went wrong while preparing your study material.",
    );
  }

  return (
    <main className="website">
      <ContinuousBackground />

      {/* =========================================
          HOME
      ========================================= */}

      <section id="home" className="home-section">
        <div className="page-shell">
          <header className="main-header">
            <button className="wordmark" onClick={() => navigate("Home")}>
              StudyLoop
            </button>

            <nav className="liquid-nav">
              <div
                className="nav-navigator"
                style={{
                  transform: `translateX(${activeIndex * 100}%)`,
                }}
              />

              {NAV_ITEMS.map((item) => (
                <button
                  key={item}
                  className={
                    activeNav === item ? "nav-button active" : "nav-button"
                  }
                  onClick={() => navigate(item)}
                >
                  {item}
                </button>
              ))}
            </nav>

            <button
              className="account-button"
              aria-label="Login"
              onClick={() => router.push("/login")}
            >
              <UserIcon />
            </button>
          </header>

          <div className="hero">
            <h1>
              Train Your
              <br />
              Understanding.
            </h1>

            <p>Not just memory.</p>

            <div className="hero-actions">
              <button
                className="primary-pill"
                onClick={() => scrollToSection("upload")}
              >
                Get Started
                <ArrowIcon />
              </button>

              <button
                className="glass-pill"
                onClick={() => scrollToSection("rapid-viva")}
              >
                Rapid Viva
                <ArrowIcon />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================
          REAL DOCUMENT UPLOAD
      ========================================= */}

      <section id="upload" className="scroll-section">
        <div className="page-shell">
          <div className="section-heading">
            <p className="section-kicker">DOCUMENT UPLOAD</p>

            <h2>Upload your study material.</h2>
          </div>

          <div className="upload-layout">
            <div className="document-area">
              {documents.length === 0 ? (
                <div className="empty-document-area">
                  Uploaded documents will appear here.
                </div>
              ) : (
                <div className="document-grid">
                  {documents.map((document) => (
                    <article
                      className="document-card glass-card"
                      key={document.id}
                    >
                      <DocumentIcon />

                      <div className="document-copy">
                        <strong>{document.originalName}</strong>

                        <span>
                          {formatFileSize(Number(document.sizeBytes))}
                        </span>

                        {document.status && (
                          <span className="document-status">
                            {document.status}
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {uploadPhase !== "EMPTY" && (
                <div
                  className={`upload-state upload-state-${uploadPhase.toLowerCase()}`}
                >
                  {(uploadPhase === "UPLOADING" ||
                    uploadPhase === "PROCESSING") && (
                    <span className="small-spinner" />
                  )}

                  {uploadPhase === "READY" && <span className="ready-dot" />}

                  <span>{uploadMessage}</span>
                </div>
              )}

              {errorMessage && (
                <div className="upload-error">{errorMessage}</div>
              )}
            </div>

            <aside className="upload-controls">
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden-file-input"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.md,.rtf,.xls,.xlsx"
                onChange={handleFiles}
              />

              <button
                className="upload-button"
                disabled={uploadPhase === "UPLOADING"}
                onClick={() => fileInput.current?.click()}
              >
                <UploadIcon />

                {uploadPhase === "UPLOADING" ? "Uploading…" : "Upload"}
              </button>

              <div className="upload-information">
                <p>
                  PDF, DOC, DOCX, PPT, PPTX, TXT, CSV, MD, RTF, XLS and XLSX.
                </p>

                <p>Maximum file size: 50 MB per file.</p>

                <p>Up to 10 files per upload.</p>
              </div>

              <button
                className="continue-button"
                disabled={!canStartStudy || startingSession}
                onClick={startStudy}
              >
                {startingSession ? "Preparing Session…" : "Start Study"}

                {!startingSession && <ArrowIcon />}
              </button>
            </aside>
          </div>
        </div>
      </section>

      {/* =========================================
          RAPID VIVA INTRO
      ========================================= */}

      <section id="rapid-viva" className="scroll-section">
        <div className="page-shell rapid-home">
          <p className="section-kicker">RAPID VIVA</p>

          <h2>
            Test what you
            <br />
            truly understand.
          </h2>

          <p className="rapid-description">
            Upload your material and begin an adaptive voice viva. StudyLoop
            continues according to your answers and evolving mastery.
          </p>

          <button
            className="primary-pill rapid-start"
            onClick={() => router.push("/rapid-viva/upload")}
          >
            Start Rapid Viva
            <ArrowIcon />
          </button>
        </div>
      </section>

      {/* =========================================
          ABOUT
      ========================================= */}

      <section id="about" className="scroll-section">
        <div className="page-shell about-section">
          <p className="section-kicker">ABOUT</p>

          <h2>
            Learning that responds
            <br />
            to understanding.
          </h2>

          <p className="about-copy">
            StudyLoop adapts what happens next according to the learner&apos;s
            answer, difficulty and evolving concept mastery.
          </p>
        </div>
      </section>

      {/* =========================================
          CONTACT
      ========================================= */}

      <section id="contact" className="scroll-section">
        <div className="page-shell">
          <div className="contact-layout">
            <div className="contact-avatar">
              <UserIcon />
            </div>

            <form
              className="contact-form glass-card"
              onSubmit={(event) => event.preventDefault()}
            >
              <p className="section-kicker">CONTACT FORM</p>

              <label>
                Name
                <input type="text" />
              </label>

              <label>
                Email
                <input type="email" />
              </label>

              <label>
                Phone
                <input type="tel" />
              </label>

              <label>
                Comments
                <textarea rows={5} />
              </label>

              <button type="submit" className="contact-submit">
                Submit
              </button>
            </form>
          </div>

          <footer className="footer">
            <span>© 2026. All Rights Reserved</span>

            <div>
              <a>Terms &amp; Conditions</a>

              <a>Privacy Policy</a>
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}

function ContinuousBackground() {
  return (
    <div className="continuous-background" aria-hidden="true">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <div className="stars stars-a" />
      <div className="stars stars-b" />

      <div className="silver-landscape">
        <div className="landscape-glow" />

        <svg
          viewBox="0 0 1600 500"
          preserveAspectRatio="none"
          className="landscape-svg"
        >
          <defs>
            <linearGradient id="silverWave" x1="0" x2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0" />

              <stop offset="45%" stopColor="white" stopOpacity=".05" />

              <stop offset="78%" stopColor="white" stopOpacity=".42" />

              <stop offset="100%" stopColor="white" stopOpacity=".02" />
            </linearGradient>
          </defs>

          <path
            className="landscape-line landscape-line-a"
            d="
              M0 460
              C190 455 320 428 450 410
              C590 392 680 350 805 365
              C930 382 1030 294 1165 310
              C1300 328 1420 255 1600 272
            "
          />

          <path
            className="landscape-line landscape-line-b"
            d="
              M0 486
              C250 470 390 450 560 435
              C715 421 795 390 910 402
              C1040 417 1150 350 1280 362
              C1410 375 1510 332 1600 340
            "
          />
        </svg>

        <div className="landscape-particles" />
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="7.5" r="3.5" />

      <path d="M5 20c.5-4.2 3-6.3 7-6.3s6.5 2.1 7 6.3" />
    </svg>
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

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 15v4h14v-4" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <div className="document-icon">
      <span />
      <span />
      <span />
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
