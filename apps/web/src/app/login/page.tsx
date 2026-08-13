"use client";

import {
  useRouter,
} from "next/navigation";

export default function LoginPage() {
  const router =
    useRouter();

  return (
    <main className="app-page login-page">
      <div className="app-background" />

      <div className="login-card glass-card">
        <button
          className="wordmark"
          onClick={() =>
            router.push("/")
          }
        >
          StudyLoop
        </button>

        <p className="section-kicker">
          LOGIN
        </p>

        <h1>
          Welcome back.
        </h1>

        <label>
          Email
          <input type="email" />
        </label>

        <label>
          Password
          <input type="password" />
        </label>

        <button className="login-submit">
          Login
        </button>
      </div>
    </main>
  );
}
