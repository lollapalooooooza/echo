"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  MessageCircle,
  Mic,
  MoonStar,
  PhoneOff,
  Send,
  Sparkles,
  SunMedium,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: any[];
  articles?: any[];
  streaming?: boolean;
}

interface ArticleRef {
  sourceId: string;
  title: string;
  url?: string | null;
  excerpt: string;
  publishDate?: string | null;
  topic?: string | null;
  chunks: { chunkId: string; heading?: string | null; score: number }[];
}

type RoomTheme = "light" | "dark";

export function FallbackRoom({
  character,
  slug,
  canReturnToRunwayLive = false,
  onReturnToRunwayLive,
}: {
  character: any;
  slug: string;
  canReturnToRunwayLive?: boolean;
  onReturnToRunwayLive?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [listening, setListening] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [subtitle, setSubtitle] = useState("");
  const [convId, setConvId] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<{ idle?: string; speaking?: string }>({
    idle: character.idleVideoUrl || undefined,
    speaking: character.speakingVideoUrl || undefined,
  });
  const [videoMode, setVideoMode] = useState(true);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [roomTheme, setRoomTheme] = useState<RoomTheme>("light");
  const [audioIssue, setAudioIssue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setVideoUrls({
      idle: character.idleVideoUrl || undefined,
      speaking: character.speakingVideoUrl || undefined,
    });
  }, [character.idleVideoUrl, character.speakingVideoUrl]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("fallback-room-theme");
      if (stored === "light" || stored === "dark") {
        setRoomTheme(stored);
      }
    } catch {
      /* ignore storage failures */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("fallback-room-theme", roomTheme);
    } catch {
      /* ignore storage failures */
    }
  }, [roomTheme]);

  useEffect(() => {
    audioRef.current = new Audio();
    const handleAudioEnd = () => setSpeaking(false);
    const handleAudioError = () => {
      setSpeaking(false);
      setAudioIssue("Audio playback was blocked or failed in the browser.");
    };

    audioRef.current.addEventListener("ended", handleAudioEnd);
    audioRef.current.addEventListener("error", handleAudioError);

    return () => {
      audioRef.current?.pause();
      audioRef.current?.removeEventListener("ended", handleAudioEnd);
      audioRef.current?.removeEventListener("error", handleAudioError);
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showTranscript]);

  useEffect(() => {
    if (!subtitle || speaking || loading) return;
    const timeout = window.setTimeout(() => setSubtitle(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [loading, speaking, subtitle]);

  const playAudio = useCallback(
    async (b64: string) => {
      if (speakerOff || !audioRef.current) return;

      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      audioUrlRef.current = URL.createObjectURL(new Blob([arr], { type: "audio/mpeg" }));
      audioRef.current.src = audioUrlRef.current;
      setAudioIssue("");

      try {
        await audioRef.current.play();
        setSpeaking(true);
      } catch {
        setSpeaking(false);
        setAudioIssue("Voice was generated, but the browser blocked autoplay. Tap the speaker and try again.");
      }
    },
    [speakerOff]
  );

  const interrupt = useCallback(() => {
    audioRef.current?.pause();
    setSpeaking(false);
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setMessages((current) => current.map((message) => (message.streaming ? { ...message, streaming: false } : message)));
  }, []);

  const toggleListen = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setAudioIssue("Voice input needs Chrome or another browser with Web Speech enabled.");
      return;
    }

    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }

    if (speaking || loading) interrupt();

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");
      setInput(transcript);
      if (event.results[0].isFinal) {
        setListening(false);
        if (transcript.trim()) {
          setTimeout(() => send(transcript.trim()), 100);
        }
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = (event: any) => {
      setListening(false);
      if (event?.error && event.error !== "no-speech" && event.error !== "aborted") {
        setAudioIssue(`Voice input error: ${event.error}`);
      }
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
    setAudioIssue("");
  }, [interrupt, listening, loading, speaking]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      if (loading || speaking) interrupt();

      setAudioIssue("");
      setMessages((current) => [...current, { id: `u${Date.now()}`, role: "user", content: text }]);
      setInput("");
      setLoading(true);

      const assistantId = `a${Date.now()}`;
      setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "", streaming: true }]);
      const history = messages
        .filter((message) => !message.streaming)
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            message: text,
            history,
            voiceEnabled: !speakerOff,
            sessionId: `room_${slug}`,
            conversationId: convId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`API ${response.status}`);

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let full = "";
        let sources: any[] = [];
        let articles: any[] = [];
        let buffer = "";
        let receivedAudio = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const block of parts) {
            if (!block.trim()) continue;
            const eventLine = block.match(/^event:\s*(.+)$/m);
            const dataLine = block.match(/^data:\s*(.+)$/m);
            if (!eventLine || !dataLine) continue;

            let data: any;
            try {
              data = JSON.parse(dataLine[1]);
            } catch {
              continue;
            }

            switch (eventLine[1].trim()) {
              case "text":
                full += data.chunk;
                setSubtitle(full);
                setMessages((current) =>
                  current.map((message) => (message.id === assistantId ? { ...message, content: full } : message))
                );
                break;
              case "sources":
                sources = data;
                setMessages((current) =>
                  current.map((message) => (message.id === assistantId ? { ...message, sources: data } : message))
                );
                break;
              case "articles":
                articles = data;
                setMessages((current) =>
                  current.map((message) => (message.id === assistantId ? { ...message, articles: data } : message))
                );
                break;
              case "audio":
                receivedAudio = true;
                void playAudio(data.audioBase64);
                break;
              case "audio_error":
                setAudioIssue(data.error || "Voice synthesis failed for this reply.");
                break;
              case "video":
                if (data.speakingVideoUrl) setVideoUrls((current) => ({ ...current, speaking: data.speakingVideoUrl }));
                if (data.idleVideoUrl) setVideoUrls((current) => ({ ...current, idle: data.idleVideoUrl }));
                break;
              case "done":
                if (data.conversationId) setConvId(data.conversationId);
                setMessages((current) =>
                  current.map((message) =>
                    message.id === assistantId ? { ...message, streaming: false, sources, articles } : message
                  )
                );
                if (!speakerOff && !receivedAudio) {
                  setAudioIssue("No voice clip was returned for this reply. This character may not have a usable ElevenLabs voice attached.");
                }
                break;
              case "error":
                setAudioIssue(data.error || "Chat failed.");
                break;
            }
          }
        }

        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, streaming: false } : message))
        );
      } catch (error: any) {
        if (error.name === "AbortError") {
          setMessages((current) =>
            current.map((message) => (message.id === assistantId ? { ...message, streaming: false } : message))
          );
        } else {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: "Connection error. Please try again.", streaming: false }
                : message
            )
          );
          setAudioIssue(error.message || "Connection error");
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [character.id, convId, interrupt, loading, messages, playAudio, slug, speakerOff, speaking]
  );

  const hasVideo = !!(videoUrls.idle || videoUrls.speaking);
  const currentVideo = speaking ? videoUrls.speaking : videoUrls.idle;
  const started = messages.length > 0;
  const isLight = roomTheme === "light";
  const lyricLines = buildLyricLines(subtitle);
  const pulseOffset = speaking ? Math.min(32, Math.max(10, subtitle.length / 5)) : 8;

  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden transition-colors duration-500",
        isLight ? "bg-[#f8f6f1] text-slate-900" : "room-backdrop text-white"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isLight
            ? "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(246,241,233,0.72)_34%,_rgba(232,227,220,0.45)_100%)]"
            : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_rgba(0,0,0,0)_38%)]"
        )}
      />

      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/lobby"
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors",
            isLight ? "bg-white/80 text-slate-600 hover:text-slate-900" : "bg-white/10 text-white/60 hover:text-white"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Leave
        </Link>

        <div className="flex items-center gap-2">
          {canReturnToRunwayLive && onReturnToRunwayLive && (
            <button
              onClick={onReturnToRunwayLive}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors",
                isLight
                  ? "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/18"
                  : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Runway Live
            </button>
          )}

          <button
            onClick={() => setRoomTheme((current) => (current === "light" ? "dark" : "light"))}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              isLight ? "bg-white/80 text-slate-600 hover:text-slate-900" : "bg-white/10 text-white/60 hover:text-white"
            )}
            aria-label="Toggle room theme"
          >
            {isLight ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
          </button>

          <button
            onClick={() => setShowTranscript((current) => !current)}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              isLight ? "bg-white/80 text-slate-600 hover:text-slate-900" : "bg-white/10 text-white/60 hover:text-white"
            )}
            aria-label="Toggle transcript"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className={cn("relative z-10 grid min-h-[calc(100vh-5.5rem)]", showTranscript ? "lg:grid-cols-[minmax(0,1fr)_26rem]" : "lg:grid-cols-1")}>
        <div className="flex min-w-0 flex-col items-center justify-between px-4 pb-6 pt-2 sm:px-6 lg:px-10">
          <div className="flex w-full max-w-4xl flex-1 flex-col items-center justify-center">
            <div
              className={cn(
                "mb-5 rounded-full px-4 py-1.5 text-[11px] font-medium tracking-[0.18em] uppercase",
                isLight ? "bg-white/80 text-slate-500 shadow-sm" : "bg-white/10 text-white/60"
              )}
            >
              fallback session
            </div>

            <div className="relative mb-8 flex items-center justify-center">
              {(speaking || loading) && (
                <>
                  <div
                    className={cn(
                      "absolute rounded-full border animate-pulse-ring",
                      isLight ? "border-amber-300/60" : "border-white/15"
                    )}
                    style={{ inset: `-${pulseOffset}px` }}
                  />
                  <div
                    className={cn(
                      "absolute rounded-full border animate-pulse-ring",
                      isLight ? "border-amber-200/55" : "border-white/10"
                    )}
                    style={{ inset: `-${pulseOffset + 18}px`, animationDelay: "0.45s" }}
                  />
                  <div
                    className={cn(
                      "absolute rounded-full border animate-pulse-ring",
                      isLight ? "border-orange-200/45" : "border-white/5"
                    )}
                    style={{ inset: `-${pulseOffset + 34}px`, animationDelay: "0.9s" }}
                  />
                </>
              )}

              <div
                className={cn(
                  "relative h-56 w-56 overflow-hidden rounded-full border shadow-2xl transition-all duration-500 sm:h-64 sm:w-64",
                  isLight
                    ? "border-white/80 bg-white/70 shadow-amber-100"
                    : "border-white/10 bg-white/5 shadow-black/30"
                )}
              >
                {videoMode && hasVideo && currentVideo ? (
                  <video
                    key={currentVideo}
                    src={currentVideo}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img src={character.avatarUrl || ""} alt={character.name} className="h-full w-full object-cover" />
                )}
              </div>
            </div>

            <div className="mb-4 text-center">
              <h2 className="text-[2rem] font-semibold tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {character.name}
              </h2>
              <p className={cn("mx-auto mt-2 max-w-xl text-sm leading-6", isLight ? "text-slate-500" : "text-white/45")}>
                {truncateBio(character.bio)}
              </p>
            </div>

            {(subtitle || speaking || loading) && (
              <div
                className={cn(
                  "mb-8 w-full max-w-2xl overflow-hidden rounded-[28px] border px-6 py-5 shadow-xl backdrop-blur-xl",
                  isLight
                    ? "border-white/70 bg-white/65 shadow-amber-100/80"
                    : "border-white/10 bg-white/10 shadow-black/25"
                )}
              >
                <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-[0.22em]", isLight ? "text-slate-400" : "text-white/35")}>
                  live response
                </p>
                <div className="space-y-2">
                  {(lyricLines.length > 0 ? lyricLines : [loading ? "Thinking..." : character.greeting]).map((line, index) => (
                    <p
                      key={`${line}-${index}`}
                      className={cn(
                        "animate-fade-in text-center transition-all duration-300",
                        index === lyricLines.length - 1
                          ? isLight
                            ? "text-[1.15rem] font-medium text-slate-900"
                            : "text-[1.15rem] font-medium text-white"
                          : isLight
                            ? "text-sm text-slate-400"
                            : "text-sm text-white/40"
                      )}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {audioIssue && (
              <div
                className={cn(
                  "mb-6 w-full max-w-xl rounded-2xl border px-4 py-3 text-sm",
                  isLight ? "border-amber-200 bg-amber-50 text-amber-800" : "border-amber-300/20 bg-amber-300/10 text-amber-100"
                )}
              >
                {audioIssue}
              </div>
            )}

            {!started && (
              <div className="w-full max-w-2xl animate-fade-in text-center">
                <p className={cn("mx-auto mb-3 max-w-xl text-base leading-7", isLight ? "text-slate-700" : "text-white/75")}>
                  {character.greeting}
                </p>
                <p className={cn("mb-6 text-[13px]", isLight ? "text-slate-400" : "text-white/35")}>
                  A lighter fallback room for text, voice, and citation previews when Runway live is unavailable.
                </p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {(character.suggestedQuestions || []).map((question: string, index: number) => (
                    <button
                      key={index}
                      onClick={() => send(question)}
                      className={cn(
                        "rounded-full px-4 py-2 text-[13px] transition-colors",
                        isLight
                          ? "bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                          : "border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                      )}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className={cn(
              "sticky bottom-4 z-20 mt-6 flex w-full max-w-3xl flex-col gap-3 rounded-[28px] border px-4 py-4 shadow-xl backdrop-blur-xl sm:px-5",
              isLight
                ? "border-white/70 bg-white/78 shadow-amber-100/80"
                : "border-white/10 bg-black/35 shadow-black/30"
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleListen}
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-full transition-all",
                  listening
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                    : isLight
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-white/10 text-white/70 hover:bg-white/15"
                )}
                aria-label="Voice input"
              >
                <Mic className="h-5 w-5" />
              </button>

              {hasVideo && (
                <button
                  onClick={() => setVideoMode((current) => !current)}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors",
                    isLight ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-white/10 text-white/70 hover:bg-white/15"
                  )}
                >
                  {videoMode ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                  {videoMode ? "Video" : "Static"}
                </button>
              )}

              <button
                onClick={() => {
                  setSpeakerOff((current) => !current);
                  if (!speakerOff) {
                    audioRef.current?.pause();
                    setSpeaking(false);
                  } else {
                    setAudioIssue("");
                  }
                }}
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                  speakerOff
                    ? "bg-rose-500/15 text-rose-500"
                    : isLight
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-white/10 text-white/70 hover:bg-white/15"
                )}
                aria-label="Toggle speaker"
              >
                {speakerOff ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>

              <div className={cn("ml-auto flex items-center gap-2 text-[12px]", isLight ? "text-slate-400" : "text-white/40")}>
                {(speaking || loading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {listening ? "Listening" : speaking ? "Speaking" : loading ? "Thinking" : "Ready"}
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={listening ? "Listening..." : loading ? "Wait or interrupt..." : "Type your next message"}
                className={cn(
                  "h-12 flex-1 rounded-full border px-4 text-sm outline-none transition-colors",
                  isLight
                    ? "border-slate-200 bg-[#faf8f4] text-slate-900 placeholder:text-slate-400 focus:border-slate-300"
                    : "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-white/20"
                )}
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className={cn(
                  "inline-flex h-12 w-12 items-center justify-center rounded-full transition-colors disabled:opacity-40",
                  isLight ? "bg-slate-900 text-white hover:bg-slate-700" : "bg-white text-slate-900 hover:bg-white/90"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
              <Link
                href="/lobby"
                className={cn(
                  "inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  isLight ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-rose-500/90 text-white hover:bg-rose-500"
                )}
              >
                <PhoneOff className="h-4 w-4" />
                Leave
              </Link>
            </form>
          </div>
        </div>

        {showTranscript && (
          <aside
            className={cn(
              "mx-4 mb-6 flex min-h-[28rem] flex-col overflow-hidden rounded-[30px] border shadow-xl backdrop-blur-2xl lg:mx-6 lg:my-4 lg:min-h-0",
              isLight
                ? "border-white/75 bg-white/52 shadow-slate-200/70"
                : "border-white/10 bg-black/28 shadow-black/30"
            )}
          >
            <div className={cn("border-b px-5 py-4", isLight ? "border-slate-200/70" : "border-white/10")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={cn("text-[11px] font-semibold uppercase tracking-[0.22em]", isLight ? "text-slate-400" : "text-white/35")}>
                    transcript
                  </p>
                  <p className={cn("mt-1 text-sm", isLight ? "text-slate-600" : "text-white/60")}>
                    Chat history, source cards, and article previews.
                  </p>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              <div className={cn("rounded-2xl px-4 py-3", isLight ? "bg-white/75 text-slate-700" : "bg-white/5 text-white/70")}>
                <p className={cn("mb-1 text-[11px]", isLight ? "text-slate-400" : "text-white/35")}>{character.name}</p>
                <p className="text-sm leading-6">{character.greeting}</p>
              </div>

              {messages.map((message) => (
                <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[88%] min-w-0 space-y-2", message.role === "user" && "items-end")}>
                    <div
                      className={cn(
                        "rounded-[24px] px-4 py-3 shadow-sm",
                        message.role === "user"
                          ? isLight
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-900"
                          : isLight
                            ? "bg-white/78 text-slate-700"
                            : "bg-white/8 text-white/80"
                      )}
                    >
                      <p className={cn("mb-1 text-[11px]", message.role === "user" ? "text-white/60" : isLight ? "text-slate-400" : "text-white/35")}>
                        {message.role === "user" ? "You" : character.name}
                      </p>
                      {message.streaming && !message.content ? (
                        <Loader2 className={cn("h-3.5 w-3.5 animate-spin", isLight ? "text-slate-400" : "text-white/40")} />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                      )}
                    </div>

                    {message.articles && message.articles.length > 0 && !message.streaming && (
                      <div className="space-y-2">
                        {message.articles.map((article: ArticleRef) => (
                          <div
                            key={article.sourceId}
                            className={cn(
                              "overflow-hidden rounded-[22px] border backdrop-blur-xl transition-colors",
                              isLight
                                ? "border-white/70 bg-white/60 hover:bg-white/75"
                                : "border-white/10 bg-white/6 hover:bg-white/10"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedArticle(expandedArticle === article.sourceId ? null : article.sourceId)}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left"
                            >
                              <div
                                className={cn(
                                  "mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl",
                                  isLight ? "bg-slate-100 text-slate-500" : "bg-white/10 text-white/50"
                                )}
                              >
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={cn("truncate text-sm font-medium", isLight ? "text-slate-800" : "text-white/85")}>{article.title}</p>
                                <p className={cn("mt-1 line-clamp-2 text-[12px]", isLight ? "text-slate-500" : "text-white/45")}>{article.excerpt}</p>
                                {article.topic && (
                                  <span
                                    className={cn(
                                      "mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-medium",
                                      isLight ? "bg-slate-100 text-slate-500" : "bg-white/10 text-white/50"
                                    )}
                                  >
                                    {article.topic}
                                  </span>
                                )}
                              </div>
                              <ChevronRight
                                className={cn(
                                  "mt-1 h-4 w-4 flex-shrink-0 transition-transform",
                                  isLight ? "text-slate-400" : "text-white/35",
                                  expandedArticle === article.sourceId && "rotate-90"
                                )}
                              />
                            </button>

                            {expandedArticle === article.sourceId && (
                              <div className={cn("border-t px-4 py-3", isLight ? "border-slate-200/70" : "border-white/10")}>
                                {article.chunks.map((chunk) => (
                                  <div key={chunk.chunkId} className="mb-2 last:mb-0">
                                    {chunk.heading && (
                                      <p className={cn("text-[11px] font-medium", isLight ? "text-slate-600" : "text-white/60")}>{chunk.heading}</p>
                                    )}
                                    <p className={cn("text-[11px]", isLight ? "text-slate-400" : "text-white/35")}>
                                      Relevance {Math.round(chunk.score * 100)}%
                                    </p>
                                  </div>
                                ))}
                                {article.url && (
                                  <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      "mt-2 inline-flex items-center gap-1 text-[12px] font-medium",
                                      isLight ? "text-sky-600 hover:text-sky-700" : "text-sky-300 hover:text-sky-200"
                                    )}
                                  >
                                    Open article
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {message.sources && message.sources.length > 0 && !message.articles?.length && !message.streaming && (
                      <div className="flex flex-wrap gap-2">
                        {message.sources.map((source: any, index: number) => (
                          <a
                            key={index}
                            href={source.sourceUrl || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors",
                              isLight
                                ? "bg-white/85 text-slate-500 hover:text-slate-700"
                                : "bg-white/8 text-white/45 hover:text-white/70"
                            )}
                          >
                            <BookOpen className="h-3 w-3" />
                            {(source.sourceTitle || "Source").slice(0, 24)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function buildLyricLines(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const lines = normalized
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(-3);

  return lines.length > 0 ? lines : [normalized.slice(-120)];
}

function truncateBio(value?: string | null) {
  const normalized = value?.trim() || "";
  if (!normalized) return "A calmer fallback room for this character.";
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}
