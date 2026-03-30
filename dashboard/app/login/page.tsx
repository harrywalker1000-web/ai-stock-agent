"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
        setError("Incorrect password. Access denied.");
        setPassword("");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080C10] flex items-center justify-center relative overflow-hidden">
      {/* Background orbs */}
      <div
        className="orb w-96 h-96 bg-[#0EA5E9] top-1/4 left-1/4 animate-[orb_12s_ease-in-out_infinite]"
        style={{ opacity: 0.06 }}
      />
      <div
        className="orb w-80 h-80 bg-[#06B6D4] bottom-1/3 right-1/4 animate-[orb_15s_ease-in-out_infinite_reverse]"
        style={{ opacity: 0.05 }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(14,165,233,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.8) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
            style={{
              background: "linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%)",
              boxShadow: "0 0 40px rgba(14,165,233,0.3)",
            }}>
            <span className="font-display text-2xl font-bold text-white">H</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#E8EDF2] tracking-tight">
            Haz Capital Management
          </h1>
          <p className="text-[#6B7280] text-sm mt-2">Private dashboard — authorised access only</p>
        </div>

        {/* Form card */}
        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-2"
              >
                Access Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                autoComplete="current-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#E8EDF2]
                           placeholder-[#4B5563] text-sm focus:outline-none focus:border-[#0EA5E9]/50
                           focus:ring-1 focus:ring-[#0EA5E9]/30 transition-all"
              />
            </div>

            {error && (
              <p className="text-[#EF4444] text-sm flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200
                         hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                         disabled:hover:scale-100"
              style={{
                background: "linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%)",
                boxShadow: loading ? "none" : "0 0 20px rgba(14,165,233,0.3)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Authenticating...
                </span>
              ) : (
                "Enter"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[#4B5563] text-xs mt-6">
          Session expires after 7 days
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#080C10]" />}>
      <LoginForm />
    </Suspense>
  );
}
