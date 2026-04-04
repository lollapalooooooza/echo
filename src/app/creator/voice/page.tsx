"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Loader2,
  Mic,
  Plus,
  Radio,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";

import {
  MAX_VOICE_CLONE_DURATION_SECS,
  MIN_VOICE_CLONE_DURATION_SECS,
  validateVoiceCloneFile,
} from "@/lib/voice-clone-client";
import { playVoicePreview, stopVoicePreview } from "@/lib/voice-preview";
import { cn } from "@/lib/utils";

type VoiceLibraryResponse = {
  presets: Array<{ id: string; name: string; desc?: string }>;
  custom: Array<{
    id: string;
    name: string;
    elevenLabsVoiceId: string;
    isCloned: boolean;
    createdAt: string;
    providerPreviewUrl?: string | null;
    providerStatus?: "READY" | "MISSING" | null;
    _count?: { characters?: number };
    characters?: { id: string; name: string }[];
  }>;
};

type RunwayVoice = {
  id: string;
  name: string;
  description: string | null;
  previewUrl: string | null;
  status: "READY" | "PROCESSING" | "FAILED";
  createdAt: string;
};

export default function VoiceLibraryPage() {
  const [voices, setVoices] = useState<VoiceLibraryResponse>({ presets: [], custom: [] });
  const [loading, setLoading] = useState(true);
  const [runwayVoices, setRunwayVoices] = useState<RunwayVoice[]>([]);
  const [runwayVoicesLoading, setRunwayVoicesLoading] = useState(true);
  const [runwayVoicesUnavailable, setRunwayVoicesUnavailable] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloning, setCloning] = useState(false);
  const [previewingId, setPreviewingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadVoices = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/voice/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load voices");
      }
      setVoices(data);
    } catch (err: any) {
      setError(err.message || "Failed to load voices");
    } finally {
      setLoading(false);
    }
  };

  const loadRunwayVoices = async () => {
    setRunwayVoicesLoading(true);
    try {
      const res = await fetch("/api/runway/voices", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { setRunwayVoicesUnavailable(true); return; }
        throw new Error(data.error || "Failed to load Runway voices");
      }
      if (data.unavailable) { setRunwayVoicesUnavailable(true); return; }
      setRunwayVoices(Array.isArray(data.voices) ? data.voices : []);
    } catch {
      setRunwayVoicesUnavailable(true);
    } finally {
      setRunwayVoicesLoading(false);
    }
  };

  useEffect(() => {
    void loadVoices();
    void loadRunwayVoices();
  }, []);

  useEffect(() => () => stopVoicePreview(), []);

  const totalAssignments = voices.custom.reduce(
    (sum, voice) => sum + (voice._count?.characters || 0),
    0
  );

  const handleClone = async () => {
    const file = fileRef.current?.files?.[0];
    if (!cloneName.trim() || !file) {
      setError("Choose a voice name and upload an MP3 sample first.");
      return;
    }

    setCloning(true);
    setMessage("");
    setError("");

    try {
      const { durationSecs } = await validateVoiceCloneFile(file);
      const form = new FormData();
      form.append("name", cloneName.trim());
      form.append("audio", file);
      form.append("durationSecs", durationSecs.toFixed(2));

      const res = await fetch("/api/voice/clone", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Clone failed");
      }

      setCloneName("");
      if (fileRef.current) fileRef.current.value = "";
      setMessage(`"${cloneName.trim()}" is ready in your library.`);
      await loadVoices();
    } catch (err: any) {
      setError(err.message || "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  const handleDelete = async (voiceId: string, name: string) => {
    if (!window.confirm(`Delete "${name}" from your custom voice library?`)) {
      return;
    }

    setDeletingId(voiceId);
    setMessage("");
    setError("");

    try {
      const res = await fetch(`/api/voice/${voiceId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Delete failed");
      }
      setMessage(`"${name}" was removed from your library.`);
      await loadVoices();
    } catch (err: any) {
      setError(err.message || "Delete failed");
    } finally {
      setDeletingId("");
    }
  };

  const previewText = "Hi, I am ready to become your character voice inside EchoNest.";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            Voice Library
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Voice library
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Clone, preview, assign, and reuse voices across characters for Echo playback. Runway live avatars keep their own voice configuration in Runway.
          </p>
        </div>
        <Link
          href="/creator/character/new"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
        >
          <Plus className="h-4 w-4" />
          Create character
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Custom voices" value={voices.custom.length} detail="Your reusable cloned voice library." />
        <StatCard label="Character assignments" value={totalAssignments} detail="How many characters already use a custom voice." />
        <StatCard label="Runway voices" value={runwayVoicesUnavailable ? voices.presets.length : runwayVoices.length || voices.presets.length} detail={runwayVoicesUnavailable ? "Preset voices ready to use." : runwayVoices.length > 0 ? "Custom voices in your Runway account." : "Preset voices ready to use."} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-[28px] border border-border/70 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-white">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Clone voice</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload a clean MP3 sample between {MIN_VOICE_CLONE_DURATION_SECS} seconds and {MAX_VOICE_CLONE_DURATION_SECS / 60} minutes. This creates a reusable Echo playback voice you can assign across characters.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <label className="space-y-2">
              <span className="text-[13px] font-medium text-foreground">Voice name</span>
              <input
                value={cloneName}
                onChange={(event) => setCloneName(event.target.value)}
                placeholder="e.g. Bryan Narrator"
                className="h-11 w-full rounded-2xl border border-border px-4 text-sm outline-none transition-colors focus:border-foreground"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[13px] font-medium text-foreground">Audio sample</span>
              <input
                ref={fileRef}
                type="file"
                accept=".mp3,audio/mpeg,audio/mp3"
                className="block h-11 w-full rounded-2xl border border-border px-4 py-2.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1 file:text-[12px] file:font-medium"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleClone}
              disabled={cloning}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-60"
            >
              {cloning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {cloning ? "Cloning voice..." : "Clone voice"}
            </button>
            <p className="text-[12px] text-muted-foreground">
              Tip: use a single-speaker MP3 with minimal background noise for the most reliable clone.
            </p>
          </div>

          {(message || error) && (
            <div
              className={cn(
                "mt-4 rounded-2xl px-4 py-3 text-[13px]",
                error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
              )}
            >
              {error || message}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-border/70 bg-[linear-gradient(160deg,#111827,#1f2937_46%,#273549)] p-6 text-white shadow-[0_24px_80px_rgba(17,24,39,0.18)]">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">How it works</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/72">
                Voices are managed separately, then selected while creating or editing a character. Echo uses them for fallback playback, while Runway live sessions keep using the voice configured on the Runway avatar itself.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-white/72">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Clone once, reuse across multiple characters.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Custom voices affect Echo playback, not Runway live voice.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              In-use voices stay protected from accidental deletion.
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/creator/character"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium text-neutral-900 transition-opacity hover:opacity-90"
            >
              Assign voices to characters
            </Link>
            <Link
              href="/creator/settings"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-[13px] font-medium text-white/78 transition-colors hover:bg-white/10"
            >
              Profile settings
            </Link>
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Your custom voices</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These are the voices you can select inside character creation and editing.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[28px] border border-border/70 bg-white px-6 py-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : voices.custom.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-border bg-white px-6 py-10 text-center">
            <AudioLines className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No custom voices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clone your first voice above and it will appear here for preview, assignment, and reuse.
            </p>
          </div>
        ) : (
          <div className="max-h-[36rem] overflow-y-auto pr-1">
          <div className="grid gap-4 lg:grid-cols-2">
            {voices.custom.map((voice) => {
              const usageCount = voice._count?.characters || 0;
              const previewUnavailable = voice.providerStatus === "MISSING" && !voice.providerPreviewUrl;
              return (
                <article
                  key={voice.id}
                  className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-white">
                        <Mic className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-[15px] font-semibold">{voice.name}</h3>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {voice.isCloned ? "Audio clone" : "Designed from description"} · Added {new Date(voice.createdAt).toLocaleDateString()}
                        </p>
                        {voice.providerStatus === "MISSING" && (
                          <p className="mt-1 text-[12px] text-amber-700">
                            Missing from ElevenLabs. Re-clone this voice to restore preview and playback.
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                      {usageCount} assignment{usageCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(voice.characters || []).map((character) => (
                      <Link
                        key={character.id}
                        href={`/creator/character/${character.id}`}
                        className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        {character.name}
                      </Link>
                    ))}
                    {(voice.characters || []).length === 0 && (
                      <span className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] text-muted-foreground">
                        Not assigned yet
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await playVoicePreview({
                            previewKey: voice.id,
                            voiceId: voice.elevenLabsVoiceId,
                            text: previewText,
                            audioUrl: voice.providerPreviewUrl,
                            onStart: setPreviewingId,
                            onStop: (previewKey) =>
                              setPreviewingId((current) => (current === previewKey ? "" : current)),
                          });
                        } catch (err) {
                          console.error("[VoiceLibraryPage] Preview failed:", err);
                        }
                      }}
                      disabled={previewUnavailable}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-60"
                    >
                      {previewingId === voice.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                      {previewingId === voice.id ? "Previewing" : previewUnavailable ? "Unavailable" : "Preview"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDelete(voice.id, voice.name)}
                      disabled={deletingId === voice.id || usageCount > 0}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-200 px-4 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deletingId === voice.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </button>
                  </div>

                  {usageCount > 0 && (
                    <p className="mt-3 text-[12px] text-amber-700">
                      Remove this voice from its characters before deleting it.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          </div>
        )}
      </section>

      {/* ── Runway Custom Voices ──────────────────────────────────── */}
      {!runwayVoicesUnavailable && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4 text-orange-600" />
                Your Runway custom voices
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Custom voices created via the Runway Voices API. Assign one of these to a Runway avatar by entering its ID in the character editor.
              </p>
            </div>
          </div>

          {runwayVoicesLoading ? (
            <div className="rounded-[28px] border border-border/70 bg-white px-6 py-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : runwayVoices.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-orange-200 bg-orange-50/40 px-6 py-10 text-center">
              <Radio className="mx-auto h-8 w-8 text-orange-400/60" />
              <p className="mt-3 text-sm font-medium text-orange-900">No Runway custom voices yet</p>
              <p className="mt-1 text-[13px] text-orange-700/70">
                Create custom voices on the Runway platform and they will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="max-h-[36rem] overflow-y-auto pr-1">
              <div className="grid gap-4 lg:grid-cols-2">
                {runwayVoices.map((voice) => (
                  <article
                    key={voice.id}
                    className="rounded-[28px] border border-orange-200/60 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                          <Radio className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-[15px] font-semibold">{voice.name}</h3>
                          {voice.description && (
                            <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">{voice.description}</p>
                          )}
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Added {new Date(voice.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium",
                        voice.status === "READY"
                          ? "bg-emerald-50 text-emerald-700"
                          : voice.status === "PROCESSING"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700"
                      )}>
                        {voice.status === "READY" ? "Ready" : voice.status === "PROCESSING" ? "Processing…" : "Failed"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {voice.previewUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await playVoicePreview({
                                previewKey: `runway-${voice.id}`,
                                voiceId: voice.id,
                                text: previewText,
                                audioUrl: voice.previewUrl,
                                onStart: setPreviewingId,
                                onStop: (key) =>
                                  setPreviewingId((cur) => (cur === key ? "" : cur)),
                              });
                            } catch (err) {
                              console.error("[VoiceLibraryPage] Runway preview failed:", err);
                            }
                          }}
                          className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                        >
                          {previewingId === `runway-${voice.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                          {previewingId === `runway-${voice.id}` ? "Previewing" : "Preview"}
                        </button>
                      )}
                      <div className="ml-auto flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] text-orange-700">
                        <span className="font-mono font-medium">{voice.id}</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(voice.id)}
                          className="ml-1 hover:text-orange-900"
                          title="Copy voice ID"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Echo preset voices</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Built-in playback options available inside Echo. They do not overwrite the live voice on an existing Runway avatar.
          </p>
        </div>

        <div className="max-h-[28rem] overflow-y-auto pr-1">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {voices.presets.map((voice) => (
              <article
                key={voice.id}
                className="rounded-[24px] border border-border/70 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <AudioLines className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold">{voice.name}</h3>
                    <p className="mt-1 text-[12px] text-muted-foreground">{voice.desc || "Preset voice"}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await playVoicePreview({
                        previewKey: voice.id,
                        voiceId: voice.id,
                        text: previewText,
                        onStart: setPreviewingId,
                        onStop: (previewKey) =>
                          setPreviewingId((current) => (current === previewKey ? "" : current)),
                      });
                    } catch (err) {
                      console.error("[VoiceLibraryPage] Preset preview failed:", err);
                    }
                  }}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-60"
                >
                  {previewingId === voice.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  {previewingId === voice.id ? "Previewing" : "Preview"}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-[13px] text-muted-foreground">{detail}</p>
    </div>
  );
}
