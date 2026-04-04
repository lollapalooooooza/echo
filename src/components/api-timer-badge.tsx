"use client";

/**
 * ApiTimerBadge
 *
 * Shows two things side by side:
 *  1. A countdown pill: remaining session time (MM:SS), colour-coded
 *  2. A small "API" icon button that links to /creator/api
 *
 * Fetches /api/user/api-credits on mount and every 30 s.
 * Only renders when the user is authenticated.
 *
 * Usage:
 *   <ApiTimerBadge />          — default (horizontal pill)
 *   <ApiTimerBadge size="sm" /> — compact variant for tight headers
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Cpu, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Credits = {
  mode: "free" | "own" | "blocked";
  secondsRemaining: number;
  creditBalance: number | null;
  userNumber: number;
  hasKey: boolean;
  freeTierEligible: boolean;
  keyError?: boolean;
};

function formatTime(secs: number): string {
  if (secs <= 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timerColor(secs: number, mode: Credits["mode"]) {
  if (mode === "blocked") return "text-neutral-400 bg-neutral-100 border-neutral-200";
  if (mode === "own" && secs > 0) return "text-violet-700 bg-violet-50 border-violet-200";
  if (secs <= 0) return "text-rose-600 bg-rose-50 border-rose-200";
  if (secs < 60) return "text-rose-600 bg-rose-50 border-rose-200";
  if (secs < 180) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-emerald-700 bg-emerald-50 border-emerald-200";
}

export function ApiTimerBadge({ size = "default" }: { size?: "default" | "sm" }) {
  const { status } = useSession();
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);
  // Live countdown — ticks down 1 s every second during an active session
  const [localSecs, setLocalSecs] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCredits = async () => {
    try {
      const res = await fetch("/api/user/api-credits", { cache: "no-store" });
      if (!res.ok) return;
      const data: Credits = await res.json();
      setCredits(data);
      setLocalSecs(data.secondsRemaining);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    void fetchCredits();
    const poll = setInterval(fetchCredits, 30_000);
    return () => clearInterval(poll);
  }, [status]);

  // Tick down locally between server polls so it feels live
  useEffect(() => {
    if (localSecs === null || localSecs <= 0) return;
    // Only tick for free-tier users (own-key is credited server-side)
    if (credits?.mode === "own") return;
    intervalRef.current = setInterval(() => {
      setLocalSecs((s) => (s !== null && s > 0 ? s - 1 : 0));
    }, 1_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [credits?.mode, localSecs === null]);

  if (status !== "authenticated") return null;
  if (loading) {
    return (
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-neutral-50 px-2.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!credits) return null;

  const secs = localSecs ?? credits.secondsRemaining;
  const colorClass = timerColor(secs, credits.mode);
  const isSmall = size === "sm";

  const modeLabel =
    credits.mode === "own"
      ? "Your key"
      : credits.mode === "free"
      ? "Free"
      : "No credits";

  const title =
    credits.mode === "own"
      ? `Your Runway API key · ${credits.creditBalance ?? "?"} credits remaining`
      : credits.mode === "free"
      ? `Free session time · ${credits.userNumber <= 60 ? `User #${credits.userNumber}` : ""}`
      : "No session time. Add your Runway API key to continue.";

  return (
    <div className="flex items-center gap-1.5" title={title}>
      {/* Timer pill */}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 font-mono font-semibold tabular-nums",
          isSmall ? "py-0.5 text-[11px]" : "py-1 text-[12px]",
          colorClass
        )}
      >
        <span>{formatTime(secs)}</span>
        {!isSmall && (
          <span className="font-sans text-[10px] font-medium opacity-70">{modeLabel}</span>
        )}
      </div>

      {/* API settings icon */}
      <Link
        href="/creator/api"
        className={cn(
          "flex items-center gap-1 rounded-full border border-border/60 bg-white font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground",
          isSmall ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
        )}
        title="API settings"
      >
        <Cpu className={cn(isSmall ? "h-2.5 w-2.5" : "h-3 w-3")} />
        <span>API</span>
      </Link>
    </div>
  );
}
