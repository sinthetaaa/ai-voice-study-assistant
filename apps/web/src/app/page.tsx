"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  ApiDocument,
  ReadinessResult,
  StudyPackOverviewItem,
  StudyLoopApiError,
  studyLoopApi,
} from "../lib/studyloop-api";

const NAV_ITEMS = ["Home", "About", "Login", "Contact"] as const;

type NavItem = (typeof NAV_ITEMS)[number];

type UploadPhase = "EMPTY" | "UPLOADING" | "PROCESSING" | "READY" | "ERROR";

type HomeAuthState = "CHECKING" | "AUTHENTICATED" | "ANONYMOUS" | "ERROR";

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

  const [studyPackOverview, setStudyPackOverview] = useState<
    StudyPackOverviewItem[]
  >([]);

  const [myStudiesLoading, setMyStudiesLoading] = useState(true);

  const [myStudiesError, setMyStudiesError] = useState<string | null>(null);

  const [homeAuthState, setHomeAuthState] = useState<HomeAuthState>("CHECKING");

  const [loggingOut, setLoggingOut] = useState(false);

  const [launchingStudyPackId, setLaunchingStudyPackId] = useState<
    string | null
  >(null);

  const activeIndex = NAV_ITEMS.indexOf(activeNav);

  const canStartStudy = Boolean(
    studyPackId &&
    readiness &&
    readiness.counts.activeConceptCount > 0 &&
    uploadPhase === "READY",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHomeAccount() {
      setHomeAuthState("CHECKING");
      setMyStudiesLoading(true);
      setMyStudiesError(null);

      try {
        await studyLoopApi.getCurrentUser();

        if (cancelled) {
          return;
        }

        setHomeAuthState("AUTHENTICATED");

        try {
          const overview = await studyLoopApi.getStudyPackOverview();

          if (!cancelled) {
            setStudyPackOverview(overview);
          }
        } catch (error) {
          if (cancelled) {
            return;
          }

          if (error instanceof StudyLoopApiError && error.status === 401) {
            setHomeAuthState("ANONYMOUS");
            setStudyPackOverview([]);
            setMyStudiesError(null);

            return;
          }

          if (error instanceof StudyLoopApiError) {
            setMyStudiesError(error.message);
          } else {
            setMyStudiesError("Could not load your saved studies.");
          }
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof StudyLoopApiError && error.status === 401) {
          setHomeAuthState("ANONYMOUS");
          setStudyPackOverview([]);
          setMyStudiesError(null);
        } else {
          setHomeAuthState("ERROR");

          if (error instanceof StudyLoopApiError) {
            setMyStudiesError(error.message);
          } else {
            setMyStudiesError("Could not verify your StudyLoop session.");
          }
        }
      } finally {
        if (!cancelled) {
          setMyStudiesLoading(false);
        }
      }
    }

    void loadHomeAccount();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAccountAction() {
    if (homeAuthState === "CHECKING" || loggingOut) {
      return;
    }

    if (homeAuthState !== "AUTHENTICATED") {
      router.push("/login");

      return;
    }

    setLoggingOut(true);

    try {
      await studyLoopApi.logout();

      window.location.replace("/");
    } catch (error) {
      setLoggingOut(false);

      if (error instanceof StudyLoopApiError) {
        setMyStudiesError(error.message);
      } else {
        setMyStudiesError("Could not sign out. Please try again.");
      }
    }
  }

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

  function openUploadPicker() {
    if (homeAuthState === "CHECKING") {
      return;
    }

    if (homeAuthState !== "AUTHENTICATED") {
      router.push("/login");

      return;
    }

    fileInput.current?.click();
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    if (homeAuthState !== "AUTHENTICATED") {
      event.target.value = "";

      router.push("/login");

      return;
    }

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

    const oversizedFiles = selectedFiles.filter(
      (file) => file.size > MAX_FILE_BYTES,
    );

    const uploadCandidates = selectedFiles.filter(
      (file) => file.size <= MAX_FILE_BYTES,
    );

    if (uploadCandidates.length === 0) {
      setUploadPhase("ERROR");
      setUploadMessage("No files were uploaded.");

      setErrorMessage(
        `Skipped ${oversizedFiles.length} file${
          oversizedFiles.length === 1 ? "" : "s"
        }: ${oversizedFiles
          .map((file) => `${file.name} (over 50 MB)`)
          .join(", ")}`,
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
        uploadCandidates,
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

      const rejectedSummary = [
        ...oversizedFiles.map(
          (file) => `${file.name} (over 50 MB)`,
        ),
        ...uploaded.rejected.map((file) => {
          const reason =
            file.reason === "FILE_TOO_LARGE"
              ? "over 50 MB"
              : "unsupported type";

          return `${file.originalName} (${reason})`;
        }),
      ];

      if (rejectedSummary.length > 0) {
        setErrorMessage(
          `Skipped ${rejectedSummary.length} file${
            rejectedSummary.length === 1 ? "" : "s"
          }: ${rejectedSummary.join(", ")}`,
        );
      }

      if (uploaded.uploaded === 0) {
        setUploadPhase("ERROR");
        setUploadMessage("No files were uploaded.");

        return;
      }

      setUploadPhase("PROCESSING");

      setUploadMessage("Reading your material…");

      await pollUntilReady(activeStudyPackId);
    } catch (error) {
      handleError(error);
    }
  }

  async function pollUntilReady(activeStudyPackId: string) {
    stopReadinessPoll();

    async function check() {
      try {
        const [pack, snapshot] = await Promise.all([
          studyLoopApi.getStudyPack(activeStudyPackId),

          studyLoopApi.getReadiness(activeStudyPackId),
        ]);

        setDocuments(pack.documents ?? []);

        setReadiness(snapshot);

        /*
         * Readiness is authoritative on the backend.
         *
         * It combines:
         * - material ingestion
         * - concept extraction
         * - hierarchy generation/revision
         * - availability of active study concepts
         *
         * Question sets may still be prepared lazily
         * when a bounded Normal Study session starts.
         */
        if (
          snapshot.overallState === "NORMAL_STUDY_AVAILABLE" ||
          snapshot.overallState === "NORMAL_STUDY_COMPLETE"
        ) {
          setUploadPhase("READY");
          setUploadMessage("Your material is ready.");
          stopReadinessPoll();

          return;
        }

        if (snapshot.overallState === "PREPARATION_FAILED") {
          setUploadPhase("ERROR");
          setUploadMessage("Study material preparation failed.");
          setErrorMessage(
            "StudyLoop could not finish preparing this Study Pack.",
          );
          stopReadinessPoll();

          return;
        }

        if (snapshot.overallState === "NO_ACTIVE_CONCEPTS") {
          setUploadPhase("ERROR");
          setUploadMessage("No study concepts were prepared.");
          setErrorMessage(
            "StudyLoop could not find usable study concepts in this material.",
          );
          stopReadinessPoll();

          return;
        }

        setUploadPhase("PROCESSING");

        if (
          snapshot.preparation.documents.uploaded > 0 ||
          snapshot.preparation.documents.processing > 0
        ) {
          setUploadMessage("Reading your material…");
        } else if (
          !snapshot.preparation.conceptExtraction.settled
        ) {
          setUploadMessage("Understanding key concepts…");
        } else if (
          snapshot.preparation.hierarchy.status === "GENERATING"
        ) {
          setUploadMessage("Organizing your study material…");
        } else {
          setUploadMessage("Preparing your study material…");
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

  async function openSavedStudy(pack: StudyPackOverviewItem) {
    if (launchingStudyPackId) {
      return;
    }

    const action = pack.normalStudy.primaryAction;

    setLaunchingStudyPackId(pack.studyPackId);
    setMyStudiesError(null);

    try {
      if (action.type === "RESUME_NORMAL_SESSION") {
        router.push(`/study?sessionId=${encodeURIComponent(action.sessionId)}`);

        return;
      }

      const session = await studyLoopApi.startStudySession(pack.studyPackId);

      router.push(`/study?sessionId=${encodeURIComponent(session.sessionId)}`);
    } catch (error) {
      console.error(error);

      if (error instanceof StudyLoopApiError) {
        setMyStudiesError(error.message);
      } else {
        setMyStudiesError("Could not open this study session.");
      }

      setLaunchingStudyPackId(null);
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
              type="button"
              aria-label={
                homeAuthState === "AUTHENTICATED"
                  ? loggingOut
                    ? "Signing out"
                    : "Sign out"
                  : "Sign in"
              }
              title={
                homeAuthState === "AUTHENTICATED"
                  ? loggingOut
                    ? "Signing out…"
                    : "Sign out"
                  : "Sign in"
              }
              disabled={homeAuthState === "CHECKING" || loggingOut}
              onClick={() => void handleAccountAction()}
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
          MY STUDIES
      ========================================= */}

      <section id="my-studies" className="scroll-section my-studies-section">
        <div className="page-shell">
          <div className="section-heading my-studies-heading">
            <p className="section-kicker">MY STUDIES</p>
            <h2>Pick up where you left off.</h2>
            <p className="my-studies-intro">
              Your Study Packs stay available across sessions so you can
              continue without starting over.
            </p>
          </div>

          {homeAuthState === "ANONYMOUS" ? (
            <div className="my-studies-empty glass-card">
              <p>Sign in to see your Study Packs.</p>
              <span>
                Your saved sessions, progress and mastery stay connected to your
                account.
              </span>

              <button
                className="primary-pill my-studies-empty-action"
                onClick={() => router.push("/login")}
              >
                Sign In
                <ArrowIcon />
              </button>
            </div>
          ) : homeAuthState === "ERROR" ? (
            <div className="my-studies-empty glass-card">
              <p>Could not check your account.</p>
              <span>{myStudiesError ?? "Please refresh and try again."}</span>

              <button
                className="primary-pill my-studies-empty-action"
                onClick={() => window.location.reload()}
              >
                Try Again
                <ArrowIcon />
              </button>
            </div>
          ) : myStudiesLoading ? (
            <div className="my-studies-loading glass-card">
              <span className="small-spinner" />
              <span>Loading your studies…</span>
            </div>
          ) : studyPackOverview.length === 0 ? (
            <div className="my-studies-empty glass-card">
              <p>No Study Packs yet.</p>
              <span>Upload material to begin your first study.</span>

              <button
                className="primary-pill my-studies-empty-action"
                onClick={() => scrollToSection("upload")}
              >
                Start a New Study
                <ArrowIcon />
              </button>
            </div>
          ) : (
            <div className="my-studies-grid">
              {studyPackOverview.map((pack) => {
                const action = pack.normalStudy.primaryAction;
                const launching = launchingStudyPackId === pack.studyPackId;

                const coverageLabel =
                  pack.coverage.authoritative &&
                  pack.coverage.percentage !== null
                    ? `${pack.coverage.percentage}%`
                    : "Preparing…";

                const coverageWidth =
                  pack.coverage.authoritative &&
                  pack.coverage.percentage !== null
                    ? Math.max(0, Math.min(100, pack.coverage.percentage))
                    : 0;

                const actionLabel =
                  action.type === "RESUME_NORMAL_SESSION"
                    ? `Resume Session ${action.sessionNumber}`
                    : `Start Session ${action.sessionNumber}`;

                return (
                  <article
                    className="study-pack-card glass-card"
                    key={pack.studyPackId}
                  >
                    <div className="study-pack-card-header">
                      <div>
                        <p className="study-pack-eyebrow">STUDY PACK</p>
                        <h3>{pack.name}</h3>
                      </div>

                      {pack.normalStudy.activeSession && (
                        <span className="study-pack-active-badge">ACTIVE</span>
                      )}
                    </div>

                    {pack.description && (
                      <p className="study-pack-description">
                        {pack.description}
                      </p>
                    )}

                    <div className="study-pack-coverage">
                      <div className="study-pack-coverage-row">
                        <span>Study Pack Coverage</span>
                        <strong>{coverageLabel}</strong>
                      </div>

                      <div
                        className="study-pack-coverage-track"
                        aria-hidden="true"
                      >
                        <span
                          className="study-pack-coverage-fill"
                          style={{
                            width: `${coverageWidth}%`,
                          }}
                        />
                      </div>

                      <p className="study-pack-coverage-detail">
                        {pack.coverage.authoritative
                          ? `${pack.coverage.coveredCoreConceptCount} of ${pack.coverage.totalCoreConceptCount} core concepts covered`
                          : "Curriculum coverage is still being prepared."}
                      </p>
                    </div>

                    <div className="study-pack-stats">
                      <div className="study-pack-stat">
                        <strong>
                          {pack.normalStudy.completedSessionCount}
                        </strong>
                        <span>
                          completed{" "}
                          {pack.normalStudy.completedSessionCount === 1
                            ? "session"
                            : "sessions"}
                        </span>
                      </div>

                      <div className="study-pack-stat study-pack-last-studied">
                        <strong>
                          {formatLastStudiedAt(pack.lastStudiedAt)}
                        </strong>
                        <span>last studied</span>
                      </div>
                    </div>

                    {pack.normalStudy.activeSession && (
                      <p className="study-pack-active-note">
                        Session {pack.normalStudy.activeSession.sessionNumber}{" "}
                        is active ·{" "}
                        {pack.normalStudy.activeSession.answeredQuestionCount}{" "}
                        questions answered
                      </p>
                    )}

                    <button
                      className="study-pack-detail-action"
                      onClick={() =>
                        router.push(
                          `/study-packs/${encodeURIComponent(pack.studyPackId)}`,
                        )
                      }
                    >
                      View Progress
                    </button>

                    <button
                      className="study-pack-action"
                      disabled={Boolean(launchingStudyPackId)}
                      onClick={() => void openSavedStudy(pack)}
                    >
                      {launching ? "Opening…" : actionLabel}

                      {!launching && <ArrowIcon />}
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {homeAuthState === "AUTHENTICATED" && myStudiesError && (
            <div className="my-studies-error">{myStudiesError}</div>
          )}
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
                disabled={
                  uploadPhase === "UPLOADING" || homeAuthState === "CHECKING"
                }
                onClick={openUploadPicker}
              >
                <UploadIcon />

                {homeAuthState === "CHECKING"
                  ? "Checking…"
                  : uploadPhase === "UPLOADING"
                    ? "Uploading…"
                    : "Upload"}
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

function formatLastStudiedAt(value: string | null) {
  if (!value) {
    return "Not studied yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not studied yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
