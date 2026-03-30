"use client";

import Link from "next/link";
import { useState } from "react";
import { AudioLines, Loader2, Mic, Sparkles, Volume2, X } from "lucide-react";

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
  _count?: { characters?: number };
  characters?: { id: string; name: string }[];
};

type VoiceLibrary = {
  presets: PresetVoice[];
  custom: CustomVoice[];
};

interface VoiceSelectionPanelProps {
  voices: VoiceLibrary;
  selectedVoiceId?: string;
  onSelect: (voice: { voiceId: string; voiceName: string }) => void;
  onClear?: () => void;
  previewText: string;
  className?: string;
  showLibraryLink?: boolean;
}

async function playPreview(previewVoiceId: string, previewText: string) {
  const res = await fetch("/api/voice/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voiceId: previewVoiceId,
      text: previewText,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error("Preview failed");
  }

  const buffer = await res.arrayBuffer();
  const blobUrl = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
  const audio = new Audio(blobUrl);

  audio.addEventListener("ended", () => {
    URL.revokeObjectURL(blobUrl);
  });

  await audio.play();
}

export function VoiceSelectionPanel({
  voices,
  selectedVoiceId,
  onSelect,
  onClear,
  previewText,
  className,
  showLibraryLink = true,
}: VoiceSelectionPanelProps) {
  const [previewingId, setPreviewingId] = useState("");

  const sections = [
    {
      id: "preset",
      title: "Preset Voices",
      subtitle: "Fast, polished ElevenLabs voices ready to use immediately.",
      items: voices.presets.map((voice) => ({
        key: voice.id,
        previewVoiceId: voice.id,
        title: voice.name,
        description: voice.desc || "Preset voice",
        kind: "Preset",
        icon: Sparkles,
      })),
    },
    {
      id: "custom",
      title: "Custom Voice Library",
      subtitle: "Your cloned voices, ready to be assigned to any character.",
      items: voices.custom.map((voice) => ({
        key: voice.id,
        previewVoiceId: voice.elevenLabsVoiceId,
        title: voice.name,
        description:
          voice._count?.characters && voice._count.characters > 0
            ? `Used by ${voice._count.characters} character${voice._count.characters === 1 ? "" : "s"}`
            : "Custom cloned voice",
        kind: "Custom",
        icon: Mic,
      })),
    },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted-foreground">
            Pick the voice your character should speak with. Custom voices are managed from the voice library.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {showLibraryLink && (
            <Link
              href="/creator/voice"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-white transition-opacity hover:opacity-85"
            >
              <AudioLines className="h-3.5 w-3.5" />
              Open voice library
            </Link>
          )}
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.id} className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold">{section.title}</h4>
            <p className="mt-1 text-[12px] text-muted-foreground">{section.subtitle}</p>
          </div>

          {section.items.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {section.items.map((voice) => {
                const selected = selectedVoiceId === voice.key;
                const Icon = voice.icon;
                return (
                  <div
                    key={voice.key}
                    className={cn(
                      "rounded-2xl border p-4 transition-all",
                      selected
                        ? "border-foreground bg-foreground/[0.04] shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
                        : "border-border/70 bg-white hover:border-foreground/30 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect({ voiceId: voice.key, voiceName: voice.title })}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "flex h-11 w-11 items-center justify-center rounded-2xl",
                              selected ? "bg-foreground text-white" : "bg-muted/60 text-muted-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-foreground">{voice.title}</p>
                            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{voice.description}</p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]",
                            selected ? "bg-foreground text-white" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {voice.kind}
                        </span>
                      </div>
                    </button>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setPreviewingId(voice.key);
                            await playPreview(voice.previewVoiceId, previewText);
                          } catch (error) {
                            console.error("[VoiceSelectionPanel] Preview failed:", error);
                          } finally {
                            setPreviewingId("");
                          }
                        }}
                        disabled={previewingId === voice.key}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-60"
                      >
                        {previewingId === voice.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5" />
                        )}
                        {previewingId === voice.key ? "Previewing" : "Preview"}
                      </button>

                      {selected && <span className="text-[11px] font-medium text-foreground">Selected</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-5 text-[13px] text-muted-foreground">
              No custom voices yet. Clone your voice in the library to make characters sound like you.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
