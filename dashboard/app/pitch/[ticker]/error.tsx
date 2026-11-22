"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function PitchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Pitch page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="card p-8 max-w-md w-full text-center">
        <p className="text-xs text-[#EF4444]   mb-2">Error</p>
        <h1 className="font-display text-2xl font-bold text-[#E8EDF2] mb-3">Failed to load pitch</h1>
        <p className="text-sm text-[#6B7280] mb-6  break-words">{error.message}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-[#0EA5E9]/20 text-[#0EA5E9] text-sm font-medium hover:bg-[#0EA5E9]/30 transition-colors cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/pitch"
            className="px-4 py-2 rounded-lg bg-white/05 text-[#6B7280] text-sm font-medium hover:text-[#E8EDF2] hover:bg-white/10 transition-colors"
          >
            All Pitches
          </Link>
        </div>
      </div>
    </div>
  );
}
