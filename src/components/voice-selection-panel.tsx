"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Mic, Sparkles, Upload, Volume2, Wand2, X } from "lucide-react";

import {
  MAX_VOICE_CLONE_DURATION_SECS,
  MIN_VOICE_CLONE_DURATION_SECS,
  validateVoiceCloneFile,
} from "@/lib/voice-clone-client";
import { playVoicePreview, stopVoicePreview } from "@/lib/voice-preview";
import { cn } from "@/lib/utils";

type PresetVoice = {
  id: string;
  name: string;
  desc?: string;
};

type CustomVoice = {
  id: string;
  name: string;
  elevenLabsVoiceId: string;
  isCloned?: boolean;
  providerPreviewUrl?: string | null;
  providerStatus?: "READY" | "MISSING" | null;
  providerCategory?: string | null;
  _count?: { characters?: number };
  characters?: { id: string; name: string }[];
};

type VoiceLibrary = {
  presets: PresetVoice[];
  custom: CustomVoice[];
};

type DesignedPreview = {
  generatedVoiceId: string;
  audioBase64: string;
  mediaType: string;
  durationSecs?: number | null;
};

interface VoiceSelectionPanelProps {
  voices: VoiceLibrary;
  selectedVoiceId?: string;
  onSelect: (voice: { voiceId: string; voiceName: string }) => void;
  onClear?: () => void;
  previewText: string;
  className?: string;
  onLibraryRefresh?: () => Promise<void> | void;
}

function CustomVoiceCard({
  title,
  subtitle,
  description,
  selected,
  previewing,
  previewDisabled,
  onSelect,
  onPreview,
}: {
  title: string;
  subtitle?: string;
  description: string;
  selected: boolean;
  previewing: boolean;
  previewDisabled?: boolean;
  onSelect: () => void;
  onPreview: () => Promise<void> | void;
}) {
  return (
    <div
      className={cn(
        "min-h-[9.6rem] rounded-[24px] border p-4 transition-all",
        selected
          ? "border-foreground bg-foreground/[0.04] shadow-[0_14px_30px_rgba(15,23,42,0.06)]"
          : "border-border/70 bg-white hover:border-foreground/30 hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
      )}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {subtitle && <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{subtitle}</p>}
            <p className="mt-1 truncate text-[15px] font-semibold text-foreground">{title}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
          </div>
          {selected && (
            <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground text-white">
              <Check className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </button>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void onPreview()}
          disabled={previewDisabled}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
        >
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
          {previewing ? "Playing" : previewDisabled ? "Unavailable" : "Preview"}
        </button>
        <span className="text-[11px] font-medium text-muted-foreground">{selected ? "Selected" : "Tap to choose"}</span>
      </div>
    </div>
  );
}

export function VoiceSelectionPanel({
  voices,
  selectedVoiceId,
  onSelect,
  onClear,
  previewText,
  className,
  onLibraryRefresh,
}: VoiceSelectionPanelProps) {
  const [previewingId, setPreviewingId] = useState("");
  const [designName, setDesignName] = useState("");
  const [designDescription, setDesignDescription] = useState("");
  const [designing, setDesigning] = useState(false);
  const [savingDesignedId, setSavingDesignedId] = useState("");
  const [designError, setDesignError] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [cloneError, setCloneError] = useState("");
  const [cloneMessage, setCloneMessage] = useState("");
  const [cloning, setCloning] = useState(false);
  const [designedPreviewText, setDesignedPreviewText] = useState("");
  const [designedPreviews, setDesignedPreviews] = useState<DesignedPreview[]>([]);
  const [previewingDesignedId, setPreviewingDesignedId] = useState("");
  const designedAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloneFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      stopVoicePreview();
      if (designedAudioRef.current) {
        designedAudioRef.current.pause();
        designedAudioRef.current = null;
      }
    };
  }, []);

  const customVoices = useMemo(
    () =>
      voices.custom.map((voice) => ({
        ...voice,
        subtitle: voice.isCloned ? "Audio clone" : "Designed from description",
        description:
          voice.providerStatus === "MISSING"
            ? "This voice is missing from ElevenLabs. Re-clone it to use preview and playback again."
            : voice._count?.characters && voice._count.characters > 0
            ? `Used by ${voice._count.characters} character${voice._count.characters === 1 ? "" : "s"}`
            : voice.isCloned
              ? "Custom voice built from your uploaded sample."
              : "Custom voice designed from a text description.",
      })),
    [voices.custom]
  );

  const stopDesignedPreview = () => {
    if (designedAudioRef.current) {
      designedAudioRef.current.pause();
      designedAudioRef.current = null;
    }
    setPreviewingDesignedId("");
  };

  const handleVoicePreview = async (
    previewKey: string,
    voiceId: string,
    audioUrl?: string | null
  ) => {
    stopDesignedPreview();
    await playVoicePreview({
      previewKey,
      voiceId,
      text: previewText,
      audioUrl,
      onStart: setPreviewingId,
      onStop: (currentKey) => setPreviewingId((current) => (current === currentKey ? "" : current)),
    });
  };

  const handleCloneVoice = async () => {
    const file = cloneFileRef.current?.files?.[0];
    if (!cloneName.trim() || !file) {
      setCloneError("Add a voice name and upload an MP3 sample first.");
      setCloneMessage("");
      return;
    }

    setCloneError("");
    setCloneMessage("");
    setCloning(true);

    try {
      const { durationSecs } = await validateVoiceCloneFile(file);
      const formData = new FormData();
      formData.append("name", cloneName.trim());
      formData.append("audio", file);
      formData.append("durationSecs", durationSecs.toFixed(2));

      const response = await fetch("/api/voice/clone", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Failed to clone voice");
      }

      setCloneMessage(`"${cloneName.trim()}" is ready in your custom voice library.`);
      setCloneName("");
      if (cloneFileRef.current) {
        cloneFileRef.current.value = "";
      }

      if (onLibraryRefresh) {
        await onLibraryRefresh();
      }

      if (data?.voiceId) {
        onSelect({
          voiceId: String(data.voiceId),
          voiceName: String(data?.name || cloneName.trim()),
        });
      }
    } catch (error: any) {
      setCloneError(error.message || "Failed to clone voice");
    } finally {
      setCloning(false);
    }
  };

  const handleDesignedPreview = async (preview: DesignedPreview) => {
    stopVoicePreview();
    if (previewingDesignedId === preview.generatedVoiceId) {
      stopDesignedPreview();
      return;
    }

    stopDesignedPreview();
    const audio = new Audio(`data:${preview.mediaType || "audio/mpeg"};base64,${preview.audioBase64}`);
    designedAudioRef.current = audio;
    setPreviewingDesignedId(preview.generatedVoiceId);
    audio.onended = () => stopDesignedPreview();
    audio.onerror = () => stopDesignedPreview();
    await audio.play().catch(() => stopDesignedPreview());
  };

  const handleDesign = async () => {
    if (designDescription.trim().length < 20) {
      setDesignError("Describe the voice in at least 20 characters.");
      return;
    }

    setDesigning(true);
    setDesignError("");
    stopDesignedPreview();

    try {
      const response = await fetch("/api/voice/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: designDescription.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to design voice");
      }

      setDesignedPreviewText(typeof data?.previewText === "string" ? data.previewText : "");
      setDesignedPreviews(Array.isArray(data?.previews) ? data.previews : []);
    } catch (error: any) {
      setDesignError(error.message || "Failed to design voice");
    } finally {
      setDesigning(false);
    }
  };

  const handleSaveDesignedVoice = async (preview: DesignedPreview) => {
    if (!designName.trim()) {
      setDesignError("Give this custom voice a name first.");
      return;
    }

    setSavingDesignedId(preview.generatedVoiceId);
    setDesignError("");

    try {
      const response = await fetch("/api/voice/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: designName.trim(),
          description: designDescription.trim(),
          generatedVoiceId: preview.generatedVoiceId,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save designed voice");
      }

      stopDesignedPreview();
      setDesignedPreviewText("");
      setDesignedPreviews([]);
      setDesignDescription("");
      setDesignName("");

      if (onLibraryRefresh) {
        await onLibraryRefresh();
      }

      if (data?.voice?.id && data?.voice?.name) {
        onSelect({ voiceId: data.voice.id, voiceName: data.voice.name });
      }
    } catch (error: any) {
      setDesignError(error.message || "Failed to save designed voice");
    } finally {
      setSavingDesignedId("");
    }
  };

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-[13px] text-muted-foreground">
            Pick an Echo playback voice, choose from your custom library, or design a new one from a description. These voices power fallback chat, previews, and widget playback. Runway live sessions keep using the voice already configured on the Runway avatar.
          </p>
        </div>
        {onClear && selectedVoiceId && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear voice
          </button>
        )}
      </div>

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,248,248,0.92))] p-5 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
            <div>
              <h4 className="text-sm font-semibold">Echo preset voices</h4>
              <p className="mt-1 text-[12px] text-muted-foreground">Built-in playback voices for fallback chat and widget audio.</p>
            </div>
            <div className="mt-4 max-h-[15.5rem] overflow-y-auto pr-1">
              <div className="space-y-3">
                {voices.presets.map((voice) => (
                  <CustomVoiceCard
                    key={voice.id}
                    title={voice.name}
                    subtitle="Built-in"
                    description={voice.desc || "Balanced live voice"}
                    selected={selectedVoiceId === voice.id}
                    previewing={previewingId === voice.id}
                    onSelect={() => onSelect({ voiceId: voice.id, voiceName: voice.name })}
                    onPreview={() => handleVoicePreview(voice.id, voice.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,248,248,0.92))] p-5 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
            <div>
              <h4 className="text-sm font-semibold">Custom voices</h4>
              <p className="mt-1 text-[12px] text-muted-foreground">Audio-cloned or description-designed voices for Echo playback only.</p>
            </div>
            {customVoices.length > 0 ? (
              <div className="mt-4 max-h-[15.5rem] overflow-y-auto pr-1">
                <div className="space-y-3">
                  {customVoices.map((voice) => (
                    <CustomVoiceCard
                      key={voice.id}
                      title={voice.name}
                      subtitle={voice.subtitle}
                      description={voice.description}
                      selected={selectedVoiceId === voice.id}
                      previewing={previewingId === voice.id}
                      previewDisabled={voice.providerStatus === "MISSING" && !voice.providerPreviewUrl}
                      onSelect={() => onSelect({ voiceId: voice.id, voiceName: voice.name })}
                      onPreview={() =>
                        handleVoicePreview(
                          voice.id,
                          voice.elevenLabsVoiceId,
                          voice.providerPreviewUrl
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-dashed border-border bg-muted/10 px-4 py-6 text-[13px] text-muted-foreground">
                No custom voices yet. Clone from audio in the library or design one below from a description.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,248,248,0.92))] p-5 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-white">
                <Mic className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">Clone a custom voice</h4>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Upload a clean MP3 sample between {MIN_VOICE_CLONE_DURATION_SECS} seconds and {MAX_VOICE_CLONE_DURATION_SECS / 60} minutes. This creates an Echo playback voice only. Runway live avatars keep the voice configured on Runway.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-foreground">Voice name</span>
                <input
                  value={cloneName}
                  onChange={(event) => {
                    setCloneName(event.target.value);
                    if (cloneError) setCloneError("");
                    if (cloneMessage) setCloneMessage("");
                  }}
                  placeholder="e.g. Sam Altman Playback"
                  className="h-10 w-full rounded-2xl border border-border px-3 text-sm outline-none transition-colors focus:border-foreground"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-foreground">MP3 sample</span>
                <input
                  ref={cloneFileRef}
                  type="file"
                  accept=".mp3,audio/mpeg,audio/mp3"
                  onChange={() => {
                    if (cloneError) setCloneError("");
                    if (cloneMessage) setCloneMessage("");
                  }}
                  className="block h-10 w-full rounded-2xl border border-border px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1 file:text-[12px] file:font-medium"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleCloneVoice()}
                  disabled={cloning}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[12px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {cloning ? "Cloning..." : "Clone from MP3"}
                </button>
                <p className="text-[11px] text-muted-foreground">Best results come from one speaker, no music, and minimal background noise.</p>
              </div>

              {cloneError && (
                <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{cloneError}</div>
              )}
              {cloneMessage && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-[12px] text-emerald-700">{cloneMessage}</div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,248,248,0.92))] p-5 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-white">
                <Wand2 className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">Design a custom voice</h4>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Write the mood, pacing, texture, and delivery style you want. We&apos;ll generate preview options, then you can save the one that fits.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-foreground">Voice name</span>
                <input
                  value={designName}
                  onChange={(event) => setDesignName(event.target.value)}
                  placeholder="e.g. Soft Finance Narrator"
                  className="h-10 w-full rounded-2xl border border-border px-3 text-sm outline-none transition-colors focus:border-foreground"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-foreground">Voice description</span>
                <textarea
                  value={designDescription}
                  onChange={(event) => setDesignDescription(event.target.value)}
                  rows={4}
                  placeholder="Warm, articulate, slightly husky, measured pace, calm confidence, thoughtful phrasing, natural pauses, clear endings."
                  className="w-full rounded-2xl border border-border p-3 text-sm outline-none transition-colors focus:border-foreground"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleDesign()}
                  disabled={designing || designDescription.trim().length < 20}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[12px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {designing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {designing ? "Designing..." : "Generate previews"}
                </button>
                <p className="text-[11px] text-muted-foreground">Longer, more specific descriptions usually give better voice previews.</p>
              </div>

              {designError && (
                <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{designError}</div>
              )}
            </div>

            {designedPreviews.length > 0 && (
              <div className="mt-5 space-y-3">
                <div>
                  <p className="text-[12px] font-medium text-foreground">Generated previews</p>
                  {designedPreviewText && (
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Preview script: {designedPreviewText}
                    </p>
                  )}
                </div>
                <div className="grid gap-3">
                  {designedPreviews.map((preview, index) => (
                    <div key={preview.generatedVoiceId} className="rounded-[22px] border border-border/70 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-semibold text-foreground">Option {index + 1}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {preview.durationSecs ? `${preview.durationSecs.toFixed(1)} sec preview` : "Preview ready"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDesignedPreview(preview)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                          >
                            {previewingDesignedId === preview.generatedVoiceId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Volume2 className="h-3.5 w-3.5" />
                            )}
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveDesignedVoice(preview)}
                            disabled={savingDesignedId === preview.generatedVoiceId}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                          >
                            {savingDesignedId === preview.generatedVoiceId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
