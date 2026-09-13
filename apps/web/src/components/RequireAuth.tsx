"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { StudyLoopApiError, studyLoopApi } from "@/lib/studyloop-api";

type AuthGateState = "CHECKING" | "AUTHENTICATED" | "ERROR";

type SessionCheckResult =
  | {
      status: "AUTHENTICATED";
    }
  | {
      status: "UNAUTHENTICATED";
    }
  | {
      status: "ERROR";
      message: string;
    };

async function verifySession(): Promise<SessionCheckResult> {
  try {
    await studyLoopApi.getCurrentUser();

    return {
      status: "AUTHENTICATED",
    };
  } catch (requestError) {
    if (
      requestError instanceof StudyLoopApiError &&
      requestError.status === 401
    ) {
      return {
        status: "UNAUTHENTICATED",
      };
    }

    if (requestError instanceof StudyLoopApiError) {
      return {
        status: "ERROR",
        message: requestError.message,
      };
    }

    return {
      status: "ERROR",
      message: "Could not verify your StudyLoop session.",
    };
  }
}

export default function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [state, setState] = useState<AuthGateState>("CHECKING");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runInitialCheck() {
      const result = await verifySession();

      if (cancelled) {
        return;
      }

      if (result.status === "AUTHENTICATED") {
        setState("AUTHENTICATED");

        return;
      }

      if (result.status === "UNAUTHENTICATED") {
        router.replace("/login");

        return;
      }

      setError(result.message);
      setState("ERROR");
    }

    void runInitialCheck();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function retrySessionCheck() {
    setState("CHECKING");
    setError(null);

    const result = await verifySession();

    if (result.status === "AUTHENTICATED") {
      setState("AUTHENTICATED");

      return;
    }

    if (result.status === "UNAUTHENTICATED") {
      router.replace("/login");

      return;
    }

    setError(result.message);
    setState("ERROR");
  }

  if (state === "AUTHENTICATED") {
    return <>{children}</>;
  }

  return (
    <main className="app-page auth-guard-page">
      <div className="app-background" />

      <div className="auth-guard-card glass-card">
        {state === "CHECKING" ? (
          <>
            <span className="small-spinner" />

            <p>Checking your session…</p>
          </>
        ) : (
          <>
            <p>{error ?? "Could not verify your session."}</p>

            <button
              className="login-submit"
              type="button"
              onClick={() => void retrySessionCheck()}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </main>
  );
}
