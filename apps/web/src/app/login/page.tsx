"use client";

import { FormEvent, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { StudyLoopApiError, studyLoopApi } from "@/lib/studyloop-api";

type AuthMode = "LOGIN" | "REGISTER";

function getSafeNextPath() {
  const candidate = new URLSearchParams(window.location.search).get("next");

  if (!candidate) {
    return "/";
  }

  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }

  try {
    const destination = new URL(candidate, window.location.origin);

    if (destination.origin !== window.location.origin) {
      return "/";
    }

    if (destination.pathname === "/login") {
      return "/";
    }

    return destination.pathname + destination.search + destination.hash;
  } catch {
    return "/";
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("LOGIN");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        await studyLoopApi.getCurrentUser();

        if (!cancelled) {
          router.replace(getSafeNextPath());
        }
      } catch (requestError) {
        if (
          requestError instanceof StudyLoopApiError &&
          requestError.status === 401
        ) {
          if (!cancelled) {
            setCheckingSession(false);
          }

          return;
        }

        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function switchMode(nextMode: AuthMode) {
    if (submitting) {
      return;
    }

    setMode(nextMode);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      if (mode === "LOGIN") {
        await studyLoopApi.login({
          email,
          password,
        });
      } else {
        await studyLoopApi.register({
          email,
          password,
          ...(name.trim()
            ? {
                name: name.trim(),
              }
            : {}),
        });
      }

      const destination = getSafeNextPath();

      router.replace(destination);
      router.refresh();
    } catch (requestError) {
      if (requestError instanceof StudyLoopApiError) {
        setError(requestError.message);
      } else {
        setError("Something went wrong. Please try again.");
      }

      setSubmitting(false);
    }
  }

  return (
    <main className="app-page login-page">
      <div className="app-background" />

      <div className="login-card glass-card">
        <button
          className="wordmark"
          type="button"
          onClick={() => router.push("/")}
        >
          StudyLoop
        </button>

        <div
          className="auth-mode-switch"
          role="tablist"
          aria-label="Authentication mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "LOGIN"}
            className={
              mode === "LOGIN" ? "auth-mode-button active" : "auth-mode-button"
            }
            onClick={() => switchMode("LOGIN")}
          >
            Sign in
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === "REGISTER"}
            className={
              mode === "REGISTER"
                ? "auth-mode-button active"
                : "auth-mode-button"
            }
            onClick={() => switchMode("REGISTER")}
          >
            Create account
          </button>
        </div>

        <p className="section-kicker">
          {mode === "LOGIN" ? "WELCOME BACK" : "GET STARTED"}
        </p>

        <h1>
          {mode === "LOGIN"
            ? "Continue your learning."
            : "Create your StudyLoop account."}
        </h1>

        <p className="auth-description">
          {mode === "LOGIN"
            ? "Sign in to continue with your Study Packs and study sessions."
            : "Your Study Packs, sessions, mastery and progress stay tied to your account."}
        </p>

        {checkingSession ? (
          <div className="auth-session-check" role="status">
            Checking your session…
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "REGISTER" ? (
              <label>
                Name
                <input
                  type="text"
                  value={name}
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Your name"
                  disabled={submitting}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            ) : null}

            <label>
              Email
              <input
                type="email"
                value={email}
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
                required
                disabled={submitting}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                minLength={8}
                maxLength={128}
                autoComplete={
                  mode === "LOGIN" ? "current-password" : "new-password"
                }
                placeholder="At least 8 characters"
                required
                disabled={submitting}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              className="login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? mode === "LOGIN"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "LOGIN"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
