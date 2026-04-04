"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Cpu, ExternalLink, KeyRound, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
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

export default function ApiPage() {
  const [credits, setCredits] = useState<Credits | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  const [keyInput, setKeyInput] = useState("");
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/user/api-credits", { cache: "no-store" });
      if (!res.ok) return;
      const data: Credits = await res.json();
      setCredits(data);
    } catch {
      // ignore
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCredits();
  }, [fetchCredits]);

  const handleVerifyKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setKeyLoading(true);
    setKeyMessage(null);
    setKeyError(null);
    try {
      const res = await fetch("/api/user/runway-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKeyError(data.error || "Failed to verify key.");
      } else {
        setKeyMessage(`Key verified! ${data.creditBalance != null ? `${data.creditBalance} credits (${formatTime(data.secondsRemaining)} session time).` : ""}`);
        setKeyInput("");
        await fetchCredits();
      }
    } catch {
      setKeyError("Network error. Please try again.");
    } finally {
      setKeyLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setKeyMessage(null);
    setKeyError(null);
    await fetchCredits();
    setRefreshing(false);
    setKeyMessage("Credits refreshed.");
  };

  const handleRemoveKey = async () => {
    setRemoveLoading(true);
    setKeyMessage(null);
    setKeyError(null);
    try {
      const res = await fetch("/api/user/runway-key", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setKeyError(data.error || "Failed to remove key.");
      } else {
        setKeyMessage("API key removed.");
        await fetchCredits();
      }
    } catch {
      setKeyError("Network error. Please try again.");
    } finally {
      setRemoveLoading(false);
    }
  };

  const statusColors = {
    free: "text-emerald-700 bg-emerald-50 border-emerald-200",
    own: "text-violet-700 bg-violet-50 border-violet-200",
    blocked: "text-rose-600 bg-rose-50 border-rose-200",
  };

  const statusLabel = {
    free: "Free tier",
    own: "Your key",
    blocked: "No credits",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          API
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Manage your Runway API key and view your available session time.
        </p>
      </div>

      {/* Credit status card */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Session time</h3>
          <button
            onClick={handleRefresh}
            disabled={refreshing || creditsLoading}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-40"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>

        {creditsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : credits ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Timer pill */}
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-[18px] font-bold tabular-nums",
                  statusColors[credits.mode]
                )}
              >
                {formatTime(credits.secondsRemaining)}
                <span className="font-sans text-[11px] font-medium opacity-70">
                  {statusLabel[credits.mode]}
                </span>
              </div>

              {credits.creditBalance != null && (
                <div className="text-[13px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{credits.creditBalance.toLocaleString()}</span>{" "}
                  Runway credits
                </div>
              )}
            </div>

            {/* Status description */}
            <div className="text-[13px] text-muted-foreground leading-relaxed">
              {credits.mode === "free" && credits.freeTierEligible && (
                <p>
                  You&apos;re user&nbsp;<span className="font-semibold text-foreground">#{credits.userNumber}</span>
                  {credits.userNumber <= 60
                    ? " — you have complimentary free session time courtesy of the platform."
                    : "."}
                  {credits.secondsRemaining <= 0
                    ? " Your free time has been used. Add your own Runway API key below to keep going."
                    : ` ${formatTime(credits.secondsRemaining)} remaining.`}
                </p>
              )}
              {credits.mode === "own" && !credits.keyError && (
                <p>
                  Your Runway API key is active. Session time is calculated from your live credit balance
                  at <span className="font-semibold text-foreground">3 seconds per credit</span>.
                </p>
              )}
              {credits.mode === "own" && credits.keyError && (
                <p className="text-rose-600">
                  Your key could not be verified — it may have been revoked. Please update it below.
                </p>
              )}
              {credits.mode === "blocked" && (
                <p>
                  You&apos;re user&nbsp;<span className="font-semibold text-foreground">#{credits.userNumber}</span>.
                  The free tier is available for the first 60 users. Add your own Runway API key below to continue.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Could not load credit status.</p>
        )}
      </div>

      {/* API key setup card */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Runway API key</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Your key is stored securely and used only to power live sessions.
            </p>
          </div>
          {credits?.hasKey && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Key saved
            </div>
          )}
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleVerifyKey(); }}
              placeholder={credits?.hasKey ? "Enter new key to replace…" : "key_xxxxxxxxxxxxxxxxxxxxxxxx"}
              className="h-9 w-full rounded-md border border-border pl-9 pr-3 text-sm outline-none focus:border-foreground"
              disabled={keyLoading}
            />
          </div>
          <button
            onClick={handleVerifyKey}
            disabled={keyLoading || !keyInput.trim()}
            className="flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {keyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {keyLoading ? "Verifying…" : "Verify & Save"}
          </button>
        </div>

        {/* Feedback */}
        {keyMessage && (
          <div className="flex items-center gap-2 text-[12px] text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {keyMessage}
          </div>
        )}
        {keyError && (
          <div className="flex items-center gap-2 text-[12px] text-rose-600">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            {keyError}
          </div>
        )}

        {/* Remove key */}
        {credits?.hasKey && (
          <div className="border-t border-border pt-4">
            <button
              onClick={handleRemoveKey}
              disabled={removeLoading}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
            >
              {removeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove API key
            </button>
          </div>
        )}
      </div>

      {/* Get a key callout */}
      <div className="rounded-xl border border-border bg-[linear-gradient(160deg,#f8fafc,#ffffff)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-lg">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4" />
              Get a Runway API key
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Create or manage your Runway API keys from the Runway developer dashboard. Sign up at
              runwayml.com, then visit the API Keys page in your organization settings.
            </p>
          </div>
          <a
            href="https://dev.runwayml.com/organization/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            Open Runway API Keys
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-[12px] text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Credit to time conversion</p>
          <p>2 Runway credits = 6 seconds of live session time</p>
          <p>1 credit = 3 seconds &nbsp;·&nbsp; 100 credits ≈ 5 minutes</p>
        </div>
      </div>
    </div>
  );
}
