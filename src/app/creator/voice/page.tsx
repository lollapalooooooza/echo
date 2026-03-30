"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Loader2,
  Mic,
  Plus,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";

import { cn } from "@/lib/utils";

type VoiceLibraryResponse = {
  presets: Array<{ id: string; name: string; desc?: string }>;
  custom: Array<{
    id: string;
    name: string;
    elevenLabsVoiceId: string;
    createdAt: string;
    _count?: { characters?: number };
    characters?: { id: string; name: string }[];
  }>;
};

async function playPreview(voiceId: string, text: string) {
  const res = await fetch("/api/voice/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voiceId, text, stream: false }),
  });

  if (!res.ok) {
    throw new Error("Preview failed");
  }

  const buffer = await res.arrayBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
  const audio = new Audio(url);

  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  await audio.play();
}

export default function VoiceLibraryPage() {
  const [voices, setVoices] = useState<VoiceLibraryResponse>({ presets: [], custom: [] });
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    void loadVoices();
  }, []);

  const totalAssignments = voices.custom.reduce(
    (sum, voice) => sum + (voice._count?.characters || 0),
    0
  );

  const handleClone = async () => {
    const file = fileRef.current?.files?.[0];
    if (!cloneName.trim() || !file) {
      setError("Choose a voice name and upload an audio sample first.");
      return;
    }

    setCloning(true);
    setMessage("");
    setError("");

    try {
      const form = new FormData();
      form.append("name", cloneName.trim());
      form.append("audio", file);

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
            Clone, preview, assign, and reuse voices across characters.
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
        <StatCard label="Preset voices" value={voices.presets.length} detail="Instant-ready voices for fast experiments." />
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
                Upload a clear sample between 30 seconds and 5 minutes. This creates a reusable voice you can assign across multiple characters.
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
                accept="audio/*"
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
              Tip: use clean speech without background music for the best clone quality.
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
                Voices are now managed separately, then selected while creating or editing a character. That keeps your library clean and reusable.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-white/72">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Clone once, reuse across multiple characters.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Custom voices show where they are already assigned.
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
          <div className="grid gap-4 lg:grid-cols-2">
            {voices.custom.map((voice) => {
              const usageCount = voice._count?.characters || 0;
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
                          Added {new Date(voice.createdAt).toLocaleDateString()}
                        </p>
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
                          setPreviewingId(voice.id);
                          await playPreview(voice.elevenLabsVoiceId, previewText);
                        } catch (err) {
                          console.error("[VoiceLibraryPage] Preview failed:", err);
                        } finally {
                          setPreviewingId("");
                        }
                      }}
                      disabled={previewingId === voice.id}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-60"
                    >
                      {previewingId === voice.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                      {previewingId === voice.id ? "Previewing" : "Preview"}
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
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Preset voices</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Useful defaults when you want a polished voice without cloning your own.
          </p>
        </div>

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
                    setPreviewingId(voice.id);
                    await playPreview(voice.id, previewText);
                  } catch (err) {
                    console.error("[VoiceLibraryPage] Preset preview failed:", err);
                  } finally {
                    setPreviewingId("");
                  }
                }}
                disabled={previewingId === voice.id}
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
