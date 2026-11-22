"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function PositionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Position page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="card p-8 max-w-md w-full text-center">
        <p className="text-xs text-loss mb-2">Error</p>
        <h1 className="font-serif text-h2 font-medium text-ink-1 mb-3">Failed to load position</h1>
        <p className="text-sm text-ink-3 mb-6 break-words">{error.message}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-accent/20 text-accent text-sm font-medium hover:bg-accent/30 transition-colors cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-raised/50 text-ink-3 text-sm font-medium hover:text-ink-1 hover:bg-raised transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
