"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  PhoneOff,
  Send,
  Sparkles,
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setVideoUrls({
      idle: character.idleVideoUrl || undefined,
      speaking: character.speakingVideoUrl || undefined,
    });
  }, [character.idleVideoUrl, character.speakingVideoUrl]);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.addEventListener("ended", () => setSpeaking(false));
    audioRef.current.addEventListener("error", () => setSpeaking(false));
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const playAudio = useCallback(
    (b64: string) => {
      if (speakerOff || !audioRef.current) return;
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
      audioRef.current.src = URL.createObjectURL(new Blob([arr], { type: "audio/mpeg" }));
      audioRef.current.play().catch(() => {});
      setSpeaking(true);
    },
    [speakerOff]
  );

  const interrupt = useCallback(() => {
    audioRef.current?.pause();
    setSpeaking(false);
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setSubtitle("");
    setMessages((current) => current.map((message) => (message.streaming ? { ...message, streaming: false } : message)));
  }, []);

  const toggleListen = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Use Chrome for voice input.");
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
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [interrupt, listening, loading, speaking]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      if (loading || speaking) interrupt();

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
                setSubtitle(full.slice(-120));
                setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, content: full } : message)));
                break;
              case "sources":
                sources = data;
                setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, sources: data } : message)));
                break;
              case "articles":
                articles = data;
                setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, articles: data } : message)));
                break;
              case "audio":
                playAudio(data.audioBase64);
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
                break;
              case "error":
                console.error("[FallbackRoom] Server error:", data.error);
                break;
            }
          }
        }

        setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, streaming: false } : message)));
      } catch (error: any) {
        if (error.name === "AbortError") {
          setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, streaming: false } : message)));
        } else {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: "Connection error. Please try again.", streaming: false } : message
            )
          );
        }
      } finally {
        setLoading(false);
        setSubtitle("");
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [character.id, convId, interrupt, loading, messages, playAudio, slug, speakerOff, speaking]
  );

  const hasVideo = !!(videoUrls.idle || videoUrls.speaking);
  const currentVideo = speaking ? videoUrls.speaking : videoUrls.idle;
  const started = messages.length > 0;

  return (
    <div className="room-backdrop flex h-screen flex-col text-white">
      <header className="z-10 flex items-center justify-between px-5 py-3">
        <Link href="/lobby" className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80">
          <ArrowLeft className="h-4 w-4" />
          Leave
        </Link>
        <div className="flex items-center gap-2">
          {canReturnToRunwayLive && onReturnToRunwayLive && (
            <button
              onClick={onReturnToRunwayLive}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 text-[12px] font-medium text-emerald-200 transition-colors hover:bg-emerald-400/15"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Runway Live
            </button>
          )}
          <button
            onClick={() => setShowTranscript((current) => !current)}
            className={cn("text-white/50 transition-colors hover:text-white/80", showTranscript && "text-white/80")}
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col items-center justify-center">
          <div className="relative mb-8">
            {speaking && (
              <>
                <div className="absolute -inset-5 animate-pulse-ring rounded-full border border-white/10" />
                <div
                  className="absolute -inset-3 animate-pulse-ring rounded-full border border-white/15"
                  style={{ animationDelay: "0.5s" }}
                />
              </>
            )}
            <div
              className={cn(
                "relative h-36 w-36 overflow-hidden rounded-full ring-2 transition-all duration-500 sm:h-48 sm:w-48",
                speaking ? "ring-white/40 ring-offset-4 ring-offset-[hsl(0_0%_4%)]" : "ring-white/10"
              )}
            >
              {videoMode && hasVideo && currentVideo ? (
                <video key={currentVideo} src={currentVideo} autoPlay loop muted playsInline className="h-full w-full object-cover" />
              ) : (
                <img src={character.avatarUrl || ""} alt={character.name} className="h-full w-full bg-white/5 object-cover" />
              )}
            </div>
          </div>

          <h2 className="mb-1 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {character.name}
          </h2>
          <p className="mb-4 max-w-sm text-center text-sm text-white/40">{character.bio?.slice(0, 80)}…</p>
          <div className="mb-6 rounded-full border border-amber-300/15 bg-amber-300/10 px-4 py-1.5 text-[11px] font-medium text-amber-100/80">
            Fallback chat mode
          </div>

          {speaking && (
            <div className="mb-6 flex items-end gap-[3px]">
              {[...Array(9)].map((_, index) => (
                <div key={index} className="voice-bar bg-white/60" style={{ animationDelay: `${index * 0.08}s` }} />
              ))}
            </div>
          )}

          {(speaking || loading) && subtitle && (
            <p className="max-w-md animate-fade-in text-center text-sm text-white/50">{subtitle}</p>
          )}

          {!started && (
            <div className="max-w-md animate-fade-in text-center">
              <p className="mb-4 text-sm leading-relaxed text-white/50">{character.greeting}</p>
              <p className="mb-6 text-[12px] text-white/35">
                This mode keeps the older chat + looping-media experience available if the live Runway avatar is unavailable.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {(character.suggestedQuestions || []).map((question: string, index: number) => (
                  <button
                    key={index}
                    onClick={() => send(question)}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[13px] text-white/60 transition-colors hover:border-white/20 hover:bg-white/10"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && !subtitle && (
            <div className="flex items-center gap-2 text-xs text-white/30">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
        </div>

        {showTranscript && (
          <div className="flex w-80 flex-col border-l border-white/10 bg-black/30 backdrop-blur-sm lg:w-[420px]">
            <div className="border-b border-white/10 px-5 py-3">
              <h3 className="text-sm font-medium text-white/70">Transcript</h3>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div className="flex gap-2.5">
                <img src={character.avatarUrl || ""} alt="" className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full bg-white/10" />
                <div>
                  <p className="mb-0.5 text-[11px] text-white/40">{character.name}</p>
                  <p className="text-[13px] text-white/60">{character.greeting}</p>
                </div>
              </div>

              {messages.map((message) => (
                <div key={message.id} className={cn("flex gap-2.5", message.role === "user" && "flex-row-reverse")}>
                  {message.role === "assistant" && (
                    <img src={character.avatarUrl || ""} alt="" className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full bg-white/10" />
                  )}
                  <div className={cn("max-w-[85%]", message.role === "user" && "text-right")}>
                    <p className="mb-0.5 text-[11px] text-white/40">{message.role === "user" ? "You" : character.name}</p>

                    {message.streaming && !message.content ? (
                      <Loader2 className="h-3 w-3 animate-spin text-white/30" />
                    ) : (
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/70">{message.content}</p>
                    )}

                    {message.articles && message.articles.length > 0 && !message.streaming && (
                      <div className="mt-3 space-y-2">
                        {message.articles.map((article: ArticleRef) => (
                          <div
                            key={article.sourceId}
                            className="overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-all duration-200 hover:border-white/20"
                          >
                            <div
                              className="flex cursor-pointer items-start gap-3 px-3.5 py-3"
                              onClick={() => setExpandedArticle(expandedArticle === article.sourceId ? null : article.sourceId)}
                            >
                              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                                <FileText className="h-3.5 w-3.5 text-white/50" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-medium text-white/80">{article.title}</p>
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-white/40">{article.excerpt}</p>
                                {article.topic && (
                                  <span className="mt-1 inline-block rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                                    {article.topic}
                                  </span>
                                )}
                              </div>
                              <ChevronRight
                                className={cn(
                                  "mt-1 h-3.5 w-3.5 flex-shrink-0 text-white/30 transition-transform",
                                  expandedArticle === article.sourceId && "rotate-90"
                                )}
                              />
                            </div>

                            {expandedArticle === article.sourceId && (
                              <div className="border-t border-white/10 px-3.5 py-2.5">
                                {article.chunks.map((chunk) => (
                                  <div key={chunk.chunkId} className="mb-1.5 last:mb-0">
                                    {chunk.heading && <p className="text-[10px] font-medium text-white/50">{chunk.heading}</p>}
                                    <p className="text-[10px] text-white/30">Relevance: {Math.round(chunk.score * 100)}%</p>
                                  </div>
                                ))}
                                {article.url && (
                                  <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-400/80 hover:text-blue-300"
                                  >
                                    Open original
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {message.sources && message.sources.length > 0 && !message.articles?.length && !message.streaming && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.sources.map((source: any, index: number) => (
                          <a
                            key={index}
                            href={source.sourceUrl || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/40 transition-colors hover:text-white/60"
                          >
                            <BookOpen className="h-2.5 w-2.5" />
                            {source.sourceTitle?.slice(0, 25)}…
                            <ExternalLink className="h-2 w-2" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={(event) => { event.preventDefault(); send(input); }} className="border-t border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={listening ? "Listening…" : loading ? "Interrupt to ask…" : "Type or speak…"}
                  className={cn(
                    "h-9 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/20",
                    listening && "border-emerald-500/50"
                  )}
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/60 transition-colors hover:bg-white/20 disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-white/10 px-6 py-4">
        <button
          onClick={toggleListen}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full transition-all",
            listening ? "ring-2 ring-emerald-500/50 bg-emerald-500/30 text-emerald-400" : "bg-white/10 text-white/60 hover:bg-white/15"
          )}
        >
          <Mic className="h-5 w-5" />
        </button>
        {hasVideo && (
          <button
            onClick={() => setVideoMode((current) => !current)}
            className={cn(
              "flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors",
              videoMode ? "bg-white/10 text-white/60 hover:bg-white/15" : "bg-white/5 text-white/40 hover:bg-white/10"
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
            }
          }}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
            speakerOff ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/60 hover:bg-white/15"
          )}
        >
          {speakerOff ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <Link href="/lobby" className="flex h-11 items-center gap-2 rounded-full bg-red-500/80 px-5 text-sm font-medium text-white transition-colors hover:bg-red-500">
          <PhoneOff className="h-4 w-4" />
          Leave
        </Link>
      </div>
    </div>
  );
}
