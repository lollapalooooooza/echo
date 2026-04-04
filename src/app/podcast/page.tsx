"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  MessageCircleMore,
  Mic,
  Pause,
  Play,
  Radio,
  Send,
  SkipForward,
  Volume2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { PodcastRunwayStage } from "@/components/podcast-runway-stage";

type PodcastMessage = {
  id: string;
  speaker: string;
  content: string;
  audioBase64?: string;
};

type PodcastTheme = "light" | "dark";
type PodcastMode = "runway" | "chat";

function CharacterAvatar({
  character,
  speaking,
  theme,
  side,
}: {
  character: any;
  speaking: boolean;
  theme: PodcastTheme;
  side: "left" | "right";
}) {
  const isLight = theme === "light";
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-4 transition-all duration-500",
        speaking && "scale-[1.02]"
      )}
    >
      <div
        className={cn(
          "relative h-40 w-40 overflow-hidden rounded-[32px] border-2 transition-all duration-500 sm:h-52 sm:w-52",
          speaking
            ? "border-orange-400 shadow-[0_0_40px_rgba(251,146,60,0.3)]"
            : isLight
              ? "border-neutral-200"
              : "border-white/10"
        )}
      >
        {character.avatarUrl ? (
          <img
            src={character.avatarUrl}
            alt={character.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center text-5xl font-semibold",
              isLight
                ? "bg-neutral-100 text-neutral-400"
                : "bg-neutral-800 text-neutral-500"
            )}
          >
            {character.name?.[0]}
          </div>
        )}
        {speaking && (
          <div className="absolute inset-0 flex items-end justify-center pb-3">
            <div className="flex items-end gap-1">
              {[0.6, 1, 0.8, 1.2, 0.7].map((delay, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-orange-400"
                  style={{
                    animation: `podcast-bar 0.8s ease-in-out ${delay * 0.15}s infinite alternate`,
                    height: `${12 + Math.random() * 12}px`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="text-center">
        <h3
          className={cn(
            "text-lg font-semibold tracking-tight sm:text-xl",
            isLight ? "text-slate-900" : "text-white"
          )}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {character.name}
        </h3>
        <p
          className={cn(
            "mt-1 text-[12px] font-medium capitalize",
            isLight ? "text-slate-500" : "text-white/50"
          )}
        >
          {character.personalityTone}
        </p>
      </div>
    </div>
  );
}

function TranscriptBubble({
  message,
  charA,
  charB,
  theme,
}: {
  message: PodcastMessage;
  charA: any;
  charB: any;
  theme: PodcastTheme;
}) {
  const isLight = theme === "light";
  const isA = message.speaker === charA.name;
  const character = isA ? charA : charB;

  return (
    <div
      className={cn(
        "flex gap-3",
        isA ? "justify-start" : "flex-row-reverse"
      )}
    >
      <div
        className={cn(
          "h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border",
          isLight ? "border-neutral-200" : "border-white/10"
        )}
      >
        {character.avatarUrl ? (
          <img src={character.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center text-xs font-medium",
              isLight ? "bg-neutral-100 text-neutral-500" : "bg-neutral-800 text-neutral-400"
            )}
          >
            {character.name?.[0]}
          </div>
        )}
      </div>
      <div
        className={cn(
          "max-w-[75%] rounded-[20px] px-4 py-3",
          isA
            ? isLight
              ? "bg-white border border-neutral-200 shadow-sm"
              : "bg-white/8 border border-white/8"
            : isLight
              ? "bg-orange-50 border border-orange-200/60"
              : "bg-orange-500/10 border border-orange-400/15"
        )}
      >
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.18em]",
            isA
              ? isLight ? "text-slate-400" : "text-white/40"
              : isLight ? "text-orange-600/70" : "text-orange-300/60"
          )}
        >
          {message.speaker}
        </p>
        <p
          className={cn(
            "mt-1.5 text-[13px] leading-relaxed",
            isLight ? "text-slate-700" : "text-white/85"
          )}
        >
          {message.content}
        </p>
      </div>
    </div>
  );
}

export default function PodcastPage() {

  const [charIdA, setCharIdA] = useState("");
  const [charIdB, setCharIdB] = useState("");
  const [charA, setCharA] = useState<any>(null);
  const [charB, setCharB] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [messages, setMessages] = useState<PodcastMessage[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<"A" | "B">("A");
  const [mode, setMode] = useState<PodcastMode>("chat");
  const [fromLobby, setFromLobby] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [publishDescription, setPublishDescription] = useState("");
  const [publishing, setPublishing] = useState(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pausedRef = useRef(false);
  const turnCountRef = useRef(0);
  const messagesRef = useRef<PodcastMessage[]>([]);

  const MAX_TURNS = 20;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Parse URL params on the client (avoids SSR hydration mismatch)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCharIdA(params.get("a") || "");
    setCharIdB(params.get("b") || "");
    const topicFromUrl = params.get("topic") || "";
    if (topicFromUrl) setTopic(topicFromUrl);
    if (params.get("from") === "lobby") setFromLobby(true);
  }, []);

  // Load characters
  useEffect(() => {
    if (!charIdA || !charIdB) {
      setLoading(false);
      return;
    }

    fetch("/api/characters")
      .then((r) => r.json())
      .then((chars) => {
        const list = Array.isArray(chars) ? chars : [];
        const nextCharA = list.find((c: any) => c.id === charIdA) || null;
        const nextCharB = list.find((c: any) => c.id === charIdB) || null;
        setCharA(nextCharA);
        setCharB(nextCharB);
        setMode(
          nextCharA?.runwayCharacterId && nextCharB?.runwayCharacterId
            ? "runway"
            : "chat"
        );
      })
      .finally(() => setLoading(false));
  }, [charIdA, charIdB]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  const playAudio = useCallback((base64: string): Promise<void> => {
    return new Promise((resolve) => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }, []);

  const generateTurn = useCallback(
    async (speaker: "A" | "B") => {
      if (!charA || !charB || !topic) return;

      setGenerating(true);
      setCurrentSpeaker(speaker);

      const currentMessages = messagesRef.current;
      const history = currentMessages.map((m) => ({
        speaker: m.speaker,
        content: m.content,
      }));

      try {
        const response = await fetch("/api/podcast/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterIdA: charA.id,
            characterIdB: charB.id,
            topic,
            history: history.slice(-10),
            speakerTurn: speaker,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Podcast session failed");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        let audioBase64 = "";
        const msgId = `msg-${Date.now()}-${speaker}`;
        const speakerName = speaker === "A" ? charA.name : charB.name;

        // Add placeholder message
        setMessages((prev) => [...prev, { id: msgId, speaker: speakerName, content: "" }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames: "event: <type>\ndata: <json>\n\n"
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";

          for (const frame of frames) {
            const eventMatch = frame.match(/^event:\s*(.+)$/m);
            const dataMatch = frame.match(/^data:\s*(.+)$/m);
            if (!eventMatch || !dataMatch) continue;

            const eventType = eventMatch[1].trim();
            try {
              const data = JSON.parse(dataMatch[1]);
              if (eventType === "text") {
                fullText += data.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId ? { ...m, content: fullText } : m
                  )
                );
              } else if (eventType === "audio") {
                audioBase64 = data.audio;
              }
            } catch {
              // skip parse errors
            }
          }
        }

        // Update final message with audio
        if (audioBase64) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, audioBase64 } : m
            )
          );
          // Play the audio
          await playAudio(audioBase64);
        }
      } catch (err: any) {
        console.error("[Podcast] Turn generation failed:", err);
      } finally {
        setGenerating(false);
      }
    },
    [charA, charB, topic, playAudio]
  );

  const runPodcast = useCallback(async () => {
    if (!charA || !charB || !topic) return;
    setStarted(true);
    setPaused(false);
    turnCountRef.current = 0;

    let speaker: "A" | "B" = "A";

    while (turnCountRef.current < MAX_TURNS) {
      // Wait while paused
      while (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }

      await generateTurn(speaker);
      turnCountRef.current++;
      speaker = speaker === "A" ? "B" : "A";

      // Brief pause between turns
      await new Promise((r) => setTimeout(r, 800));
    }
  }, [charA, charB, topic, generateTurn]);

  const handleStart = () => {
    if (!topic.trim()) return;
    setMessages([]);
    void runPodcast();
  };

  const handleSkip = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = audioRef.current.duration || 0;
    }
  };

  const handlePublish = async () => {
    if (!charA || !charB || !topic.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterAId: charA.id,
          characterBId: charB.id,
          topic: topic.trim(),
          description: publishDescription.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to publish podcast");
        setPublishing(false);
        return;
      }

      // Stop the current session
      setPaused(true);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Full navigation so lobby reads ?tab=podcasts from scratch
      window.location.href = "/lobby?tab=podcasts";
    } catch {
      alert("Failed to publish podcast");
      setPublishing(false);
    }
  };

  const openChatBox = () => {
    setMode("chat");
  };

  const openRunwayLive = () => {
    setPaused(true);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setMode("runway");
  };

  const theme: PodcastTheme = "light";
  const isLight = true;
  const canUseRunwayLive = !!charA?.runwayCharacterId && !!charB?.runwayCharacterId;
  const sessionTitle = topic.trim() || "Podcast Studio";

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f6f1]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!charA || !charB) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#f8f6f1] px-6 text-center">
        <div className="rounded-[28px] border border-white/80 bg-white/84 p-8 shadow-[0_28px_90px_-60px_rgba(245,158,11,0.45)]">
          <p className="text-sm text-slate-600">Select two characters from the lobby to start a podcast.</p>
        </div>
        <Link
          href="/lobby"
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to lobby
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-[100dvh] flex-col overflow-hidden transition-colors duration-500",
        isLight ? "bg-[#f8f6f1]" : "bg-neutral-950"
      )}
    >
      <style jsx global>{`
        @keyframes podcast-bar {
          from { height: 4px; }
          to { height: 20px; }
        }
      `}</style>

      <header className="border-b border-[#ece5d9] bg-white/92">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-4">
            <BrandMark href="/" size="sm" />
            <div className="min-w-0">
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-[#996026] md:block">
                Podcast Studio
              </p>
              <p
                className="max-w-[34rem] truncate text-sm font-medium leading-tight text-slate-700 md:text-[15px]"
                title={sessionTitle}
              >
                {sessionTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canUseRunwayLive && (
              <button
                type="button"
                onClick={() =>
                  mode === "runway" ? openChatBox() : openRunwayLive()
                }
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors",
                  mode === "runway"
                    ? "bg-slate-900 text-white hover:bg-slate-700"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                {mode === "runway" ? (
                  <>
                    <MessageCircleMore className="h-3.5 w-3.5" />
                    Fallback Chat
                  </>
                ) : (
                  <>
                    <Radio className="h-3.5 w-3.5" />
                    Runway Live
                  </>
                )}
              </button>
            )}

            {/* Publish button — hidden when entering from Podcast Lobby */}
            {!fromLobby && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPublish((v) => !v)}
                  disabled={publishing}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-orange-500 px-4 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                  {publishing ? "Publishing…" : "Publish"}
                </button>
                {showPublish && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-[20px] border border-neutral-200 bg-white p-5 shadow-xl">
                    <h4 className="text-sm font-semibold text-slate-900">Publish this podcast</h4>
                    <p className="mt-1 text-[12px] text-slate-500">
                      Make this character combo and topic discoverable in the Podcast Lobby.
                    </p>
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-500">Topic</label>
                        <input
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          placeholder="What's this podcast about?"
                          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-orange-400"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-500">Description (optional)</label>
                        <textarea
                          value={publishDescription}
                          onChange={(e) => setPublishDescription(e.target.value)}
                          placeholder="A short description for the lobby card..."
                          rows={2}
                          className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-orange-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowPublish(false)}
                          className="flex-1 rounded-full border border-neutral-200 py-2 text-[12px] font-medium text-slate-600 hover:bg-neutral-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePublish}
                          disabled={publishing || !topic.trim()}
                          className="flex-1 rounded-full bg-orange-500 py-2 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {publishing ? "Publishing…" : "Publish"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Link
              href="/lobby"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm text-slate-600 shadow-sm transition-colors hover:text-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Leave
            </Link>
          </div>
        </div>
      </header>

      {mode === "runway" && canUseRunwayLive ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {topic.trim() && (
            <div className="mx-auto mt-6 w-full max-w-3xl px-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-600/60">Topic</p>
              <h2
                className="mt-1 text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {topic}
              </h2>
            </div>
          )}
          <PodcastRunwayStage
            charA={charA}
            charB={charB}
            topic={topic}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {!canUseRunwayLive && (
            <div className="mx-auto mt-6 w-full max-w-5xl px-6">
              <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm leading-6 text-amber-900 shadow-sm">
                One or both characters do not have a linked Runway avatar, so the podcast opened directly in the chat box fallback.
              </div>
            </div>
          )}

        {/* Topic title above characters */}
        {topic.trim() && (
          <div className="mx-auto mt-6 w-full max-w-3xl px-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-600/60">Topic</p>
            <h2
              className="mt-1 text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {topic}
            </h2>
          </div>
        )}

        {/* Characters stage */}
        <div
          className={cn(
            "flex items-center justify-center gap-8 px-6 py-8 sm:gap-16 sm:py-10",
            isLight ? "bg-gradient-to-b from-white to-transparent" : ""
          )}
        >
          <CharacterAvatar
            character={charA}
            speaking={generating && currentSpeaker === "A"}
            theme={theme}
            side="left"
          />

          <div className="flex flex-col items-center gap-2">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full",
                isLight ? "bg-orange-100 text-orange-600" : "bg-orange-500/15 text-orange-400"
              )}
            >
              <Volume2 className="h-5 w-5" />
            </div>
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-[0.2em]",
                isLight ? "text-slate-400" : "text-white/30"
              )}
            >
              VS
            </span>
          </div>

          <CharacterAvatar
            character={charB}
            speaking={generating && currentSpeaker === "B"}
            theme={theme}
            side="right"
          />
        </div>

        {/* Topic input + controls (before starting) */}
        {!started && (
          <div className="flex flex-col items-center gap-4 px-6 pb-8">
            <div className="w-full max-w-lg">
              <label
                className={cn(
                  "mb-2 block text-[12px] font-medium",
                  isLight ? "text-slate-600" : "text-white/60"
                )}
              >
                Discussion topic
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. The future of AI in education..."
                className={cn(
                  "h-12 w-full rounded-2xl border px-4 text-sm outline-none transition-colors",
                  isLight
                    ? "border-neutral-300 bg-white focus:border-orange-400"
                    : "border-white/12 bg-white/5 text-white placeholder:text-white/30 focus:border-orange-400"
                )}
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {canUseRunwayLive && (
                <button
                  type="button"
                  onClick={openRunwayLive}
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 text-sm font-medium text-slate-700 transition-colors hover:bg-neutral-50"
                >
                  <Radio className="h-4 w-4" />
                  Runway Live
                </button>
              )}
              <button
                onClick={handleStart}
                disabled={!topic.trim()}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-orange-500 px-8 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Play className="h-4 w-4" />
                Start Podcast
              </button>
            </div>
          </div>
        )}

        {/* Playback controls (after starting) */}
        {started && (
          <div className="flex items-center justify-center gap-3 px-6 pb-4">
            <button
              onClick={() => setPaused((p) => !p)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors",
                isLight
                  ? "bg-neutral-100 text-slate-700 hover:bg-neutral-200"
                  : "bg-white/8 text-white/70 hover:bg-white/12"
              )}
            >
              {paused ? (
                <>
                  <Play className="h-3.5 w-3.5" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </>
              )}
            </button>
            <button
              onClick={handleSkip}
              disabled={!generating}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors disabled:opacity-40",
                isLight
                  ? "bg-neutral-100 text-slate-700 hover:bg-neutral-200"
                  : "bg-white/8 text-white/70 hover:bg-white/12"
              )}
            >
              <SkipForward className="h-3.5 w-3.5" /> Skip audio
            </button>
            {generating && (
              <div
                className={cn(
                  "flex items-center gap-2 text-[12px]",
                  isLight ? "text-orange-600" : "text-orange-400"
                )}
              >
                <span className="live-dot" style={{ width: 6, height: 6 }} />
                {currentSpeaker === "A" ? charA.name : charB.name} is speaking…
              </div>
            )}
          </div>
        )}

        {/* Transcript */}
        {started && (
          <div
            ref={transcriptRef}
            className={cn(
              "mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-6 pb-6",
              isLight ? "" : ""
            )}
          >
            <div className="space-y-4">
              {messages.map((msg) => (
                <TranscriptBubble
                  key={msg.id}
                  message={msg}
                  charA={charA}
                  charB={charB}
                  theme={theme}
                />
              ))}
              {messages.length === 0 && generating && (
                <div className="flex justify-center py-8">
                  <Loader2
                    className={cn(
                      "h-5 w-5 animate-spin",
                      isLight ? "text-slate-400" : "text-white/30"
                    )}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
