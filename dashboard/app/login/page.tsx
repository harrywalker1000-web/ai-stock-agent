"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ContourMark } from "@/components/brand";
import Contours from "@/components/ui/Contours";
import { IconAlert } from "@/components/ui/icons";

// Decorative terrain for the backdrop only (no data is available before sign-in)
const TERRAIN = Array.from({ length: 120 }, (_, i) => Math.sin(i / 9) * 3 + Math.sin(i / 23) * 5 + Math.sin(i / 4.3) * 0.8);

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(from);
        router.refresh();
      } else {
        setError("That password isn't correct.");
        setPassword("");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[40vh] opacity-80 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]">
        <Contours values={TERRAIN} lines={15} className="h-full w-full" height={300} />
      </div>

      <div className="relative w-full max-w-[360px]">
        <div className="mb-10">
          <ContourMark size={40} />
          <h1 className="mt-6 font-serif text-h1 font-medium text-ink-1">Haz Capital</h1>
          <p className="mt-2 text-body text-ink-2">Private dashboard. Enter the access password to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="password" className="mb-2 block text-label font-medium text-ink-2">Password</label>
            <input
              id="password" type="password" value={password} autoFocus autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error} aria-describedby={error ? "pw-error" : undefined}
              className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body text-ink-1 placeholder:text-ink-3 transition-colors duration-fast focus:border-accent focus:outline-none"
            />
          </div>

          {error && (
            <p id="pw-error" role="alert" className="flex items-center gap-2 text-label text-loss"><IconAlert size={16} />{error}</p>
          )}

          <button type="submit" disabled={loading || !password}
            className="pressable h-11 w-full rounded-md bg-accent text-body font-medium text-accent-ink hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-label text-ink-3">You stay signed in for 7 days.</p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <LoginForm />
    </Suspense>
  );
}
