"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Send, Mic, Volume2, VolumeX, MessageCircle, BookOpen,
  Loader2, PhoneOff, ExternalLink, Video, ImageIcon, FileText, ChevronRight,
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

export default function RoomPage({ params }: { params: { slug: string } }) {
  const [character, setCharacter] = useState<any>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [listening, setListening] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [subtitle, setSubtitle] = useState("");
  const [convId, setConvId] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<{ idle?: string; speaking?: string }>({});
  const [videoMode, setVideoMode] = useState(true);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load character
  useEffect(() => {
    fetch(`/api/characters`)
      .then((r) => r.json())
      .then((chars) => {
        const c = (Array.isArray(chars) ? chars : []).find((x: any) => x.slug === params.slug);
        if (c) {
          setCharacter(c);
          if (c.idleVideoUrl || c.speakingVideoUrl) {
            setVideoUrls({ idle: c.idleVideoUrl || undefined, speaking: c.speakingVideoUrl || undefined });
          }
        }
      });
  }, [params.slug]);

  // Setup audio
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.addEventListener("ended", () => setSpeaking(false));
    audioRef.current.addEventListener("error", () => setSpeaking(false));
    return () => { audioRef.current?.pause(); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const playAudio = useCallback((b64: string) => {
    if (speakerOff || !audioRef.current) return;
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    audioRef.current.src = URL.createObjectURL(new Blob([arr], { type: "audio/mpeg" }));
    audioRef.current.play().catch(() => {});
    setSpeaking(true);
  }, [speakerOff]);

  const interrupt = useCallback(() => {
    audioRef.current?.pause();
    setSpeaking(false);
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setSubtitle("");
    setMessages((p) => p.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
  }, []);

  const toggleListen = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Use Chrome for voice input.");
      return;
    }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    if (speaking || loading) interrupt();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setInput(t);
      if (e.results[0].isFinal) { setListening(false); if (t.trim()) setTimeout(() => send(t.trim()), 100); }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  }, [listening, speaking, loading, interrupt]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || !character) return;
    if (loading || speaking) interrupt();

    setMessages((p) => [...p, { id: `u${Date.now()}`, role: "user", content: text }]);
    setInput(""); setLoading(true);
    const aId = `a${Date.now()}`;
    setMessages((p) => [...p, { id: aId, role: "assistant", content: "", streaming: true }]);
    const hist = messages.filter((m) => !m.streaming).slice(-10).map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id, message: text, history: hist,
          voiceEnabled: !speakerOff, sessionId: `room_${params.slug}`, conversationId: convId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let full = ""; let sources: any[] = []; let articles: any[] = []; let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";

        for (const block of parts) {
          if (!block.trim()) continue;
          const evtLine = block.match(/^event:\s*(.+)$/m);
          const dataLine = block.match(/^data:\s*(.+)$/m);
          if (!evtLine || !dataLine) continue;
          let data: any;
          try { data = JSON.parse(dataLine[1]); } catch { continue; }

          switch (evtLine[1].trim()) {
            case "text":
              full += data.chunk;
              setSubtitle(full.slice(-120));
              setMessages((p) => p.map((m) => (m.id === aId ? { ...m, content: full } : m)));
              break;
            case "sources":
              sources = data;
              setMessages((p) => p.map((m) => (m.id === aId ? { ...m, sources: data } : m)));
              break;
            case "articles":
              articles = data;
              setMessages((p) => p.map((m) => (m.id === aId ? { ...m, articles: data } : m)));
              break;
            case "audio":
              playAudio(data.audioBase64);
              break;
            case "video":
              if (data.speakingVideoUrl) setVideoUrls((v) => ({ ...v, speaking: data.speakingVideoUrl }));
              if (data.idleVideoUrl) setVideoUrls((v) => ({ ...v, idle: data.idleVideoUrl }));
              break;
            case "done":
              if (data.conversationId) setConvId(data.conversationId);
              setMessages((p) => p.map((m) => (m.id === aId ? { ...m, streaming: false, sources, articles } : m)));
              break;
            case "error":
              console.error("[Room] Server error:", data.error);
              break;
          }
        }
      }
      setMessages((p) => p.map((m) => (m.id === aId ? { ...m, streaming: false } : m)));
    } catch (e: any) {
      if (e.name === "AbortError") {
        setMessages((p) => p.map((m) => (m.id === aId ? { ...m, streaming: false } : m)));
      } else {
        setMessages((p) => p.map((m) => (m.id === aId ? { ...m, content: "Connection error. Please try again.", streaming: false } : m)));
      }
    } finally {
      setLoading(false); setSubtitle(""); abortRef.current = null; inputRef.current?.focus();
    }
  }, [loading, speaking, character, messages, speakerOff, playAudio, convId, params.slug, interrupt]);

  if (!character) return <div className="room-backdrop flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>;

  const hasVideo = !!(videoUrls.idle || videoUrls.speaking);
  const currentVideo = speaking ? videoUrls.speaking : videoUrls.idle;
  const started = messages.length > 0;

  return (
    <div className="room-backdrop flex h-screen flex-col text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 z-10">
        <Link href="/lobby" className="text-sm text-white/50 hover:text-white/80 flex items-center gap-2 transition-colors">
          <ArrowLeft className="h-4 w-4" />Leave
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="live-dot" style={{ width: 6, height: 6 }} />
          <span className="text-[11px] text-emerald-400 font-medium">Live</span>
        </div>
        <button onClick={() => setShowTranscript(!showTranscript)} className={cn("text-white/50 hover:text-white/80 transition-colors", showTranscript && "text-white/80")}>
          <MessageCircle className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main character area */}
        <div className="flex flex-1 flex-col items-center justify-center relative">
          {/* Character video/avatar */}
          <div className="relative mb-8">
            {speaking && (
              <>
                <div className="absolute -inset-5 rounded-full border border-white/10 animate-pulse-ring" />
                <div className="absolute -inset-3 rounded-full border border-white/15 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
              </>
            )}
            <div className={cn(
              "relative h-36 w-36 sm:h-48 sm:w-48 rounded-full ring-2 overflow-hidden transition-all duration-500",
              speaking ? "ring-white/40 ring-offset-4 ring-offset-[hsl(0_0%_4%)]" : "ring-white/10"
            )}>
              {videoMode && hasVideo && currentVideo ? (
                <video key={currentVideo} src={currentVideo} autoPlay loop muted playsInline className="h-full w-full object-cover" />
              ) : (
                <img src={character.avatarUrl || ""} alt={character.name} className="h-full w-full object-cover bg-white/5" />
              )}
            </div>
          </div>

          <h2 className="mb-1 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>{character.name}</h2>
          <p className="mb-6 max-w-sm text-center text-sm text-white/40">{character.bio?.slice(0, 80)}…</p>

          {speaking && (
            <div className="mb-6 flex items-end gap-[3px]">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="voice-bar bg-white/60" style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          )}

          {(speaking || loading) && subtitle && (
            <p className="max-w-md text-center text-sm text-white/50 animate-fade-in">{subtitle}</p>
          )}

          {!started && (
            <div className="animate-fade-in max-w-md text-center">
              <p className="mb-6 text-sm leading-relaxed text-white/50">{character.greeting}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {(character.suggestedQuestions || []).map((q: string, i: number) => (
                  <button key={i} onClick={() => send(q)} className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[13px] text-white/60 hover:border-white/20 hover:bg-white/10 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && !subtitle && (
            <div className="flex items-center gap-2 text-xs text-white/30">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Thinking…
            </div>
          )}
        </div>

        {/* Transcript sidebar */}
        {showTranscript && (
          <div className="flex w-80 lg:w-[420px] flex-col border-l border-white/10 bg-black/30 backdrop-blur-sm">
            <div className="border-b border-white/10 px-5 py-3">
              <h3 className="text-sm font-medium text-white/70">Transcript</h3>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Greeting */}
              <div className="flex gap-2.5">
                <img src={character.avatarUrl || ""} alt="" className="mt-0.5 h-6 w-6 rounded-full bg-white/10 flex-shrink-0" />
                <div>
                  <p className="mb-0.5 text-[11px] text-white/40">{character.name}</p>
                  <p className="text-[13px] text-white/60">{character.greeting}</p>
                </div>
              </div>

              {/* Messages */}
              {messages.map((m) => (
                <div key={m.id} className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
                  {m.role === "assistant" && (
                    <img src={character.avatarUrl || ""} alt="" className="mt-0.5 h-6 w-6 rounded-full bg-white/10 flex-shrink-0" />
                  )}
                  <div className={cn("max-w-[85%]", m.role === "user" && "text-right")}>
                    <p className="mb-0.5 text-[11px] text-white/40">{m.role === "user" ? "You" : character.name}</p>

                    {m.streaming && !m.content ? (
                      <Loader2 className="h-3 w-3 animate-spin text-white/30" />
                    ) : (
                      <p className="text-[13px] text-white/70 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    )}

                    {/* Article Citation Blocks */}
                    {m.articles && m.articles.length > 0 && !m.streaming && (
                      <div className="mt-3 space-y-2">
                        {m.articles.map((article: ArticleRef) => (
                          <div
                            key={article.sourceId}
                            className="rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all duration-200 hover:border-white/20"
                          >
                            <div
                              className="flex items-start gap-3 px-3.5 py-3 cursor-pointer"
                              onClick={() => setExpandedArticle(expandedArticle === article.sourceId ? null : article.sourceId)}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 flex-shrink-0 mt-0.5">
                                <FileText className="h-3.5 w-3.5 text-white/50" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-medium text-white/80 truncate">{article.title}</p>
                                <p className="mt-0.5 text-[11px] text-white/40 line-clamp-2">{article.excerpt}</p>
                                {article.topic && (
                                  <span className="mt-1 inline-block rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                                    {article.topic}
                                  </span>
                                )}
                              </div>
                              <ChevronRight className={cn(
                                "h-3.5 w-3.5 text-white/30 flex-shrink-0 mt-1 transition-transform",
                                expandedArticle === article.sourceId && "rotate-90"
                              )} />
                            </div>

                            {/* Expanded content */}
                            {expandedArticle === article.sourceId && (
                              <div className="border-t border-white/10 px-3.5 py-2.5">
                                {article.chunks.map((chunk) => (
                                  <div key={chunk.chunkId} className="mb-1.5 last:mb-0">
                                    {chunk.heading && (
                                      <p className="text-[10px] font-medium text-white/50">{chunk.heading}</p>
                                    )}
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
                                    Open original <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fallback: simple source badges if no articles */}
                    {m.sources && m.sources.length > 0 && !m.articles?.length && !m.streaming && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.sources.map((s: any, i: number) => (
                          <a key={i} href={s.sourceUrl || "#"} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/40 hover:text-white/60 transition-colors">
                            <BookOpen className="h-2.5 w-2.5" />{s.sourceTitle?.slice(0, 25)}…<ExternalLink className="h-2 w-2" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input form */}
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={listening ? "Listening…" : loading ? "Interrupt to ask…" : "Type or speak…"}
                  className={cn(
                    "h-9 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 transition-colors",
                    listening && "border-emerald-500/50"
                  )}
                />
                <button type="submit" disabled={!input.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-30 transition-colors">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 px-6 py-4">
        <button onClick={toggleListen} className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-all",
          listening ? "bg-emerald-500/30 text-emerald-400 ring-2 ring-emerald-500/50" : "bg-white/10 text-white/60 hover:bg-white/15"
        )}>
          <Mic className="h-5 w-5" />
        </button>
        {hasVideo && (
          <button onClick={() => setVideoMode(!videoMode)} className={cn(
            "flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors",
            videoMode ? "bg-white/10 text-white/60 hover:bg-white/15" : "bg-white/5 text-white/40 hover:bg-white/10"
          )}>
            {videoMode ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
            {videoMode ? "Video" : "Static"}
          </button>
        )}
        <button onClick={() => { setSpeakerOff(!speakerOff); if (!speakerOff) { audioRef.current?.pause(); setSpeaking(false); } }}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
            speakerOff ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/60 hover:bg-white/15"
          )}>
          {speakerOff ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <Link href="/lobby" className="flex h-11 items-center gap-2 rounded-full bg-red-500/80 px-5 text-sm font-medium text-white hover:bg-red-500 transition-colors">
          <PhoneOff className="h-4 w-4" />Leave
        </Link>
      </div>
    </div>
  );
}
