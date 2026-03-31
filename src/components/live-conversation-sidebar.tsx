"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Pause,
  Play,
  Send,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

type SidebarMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: any[];
  articles?: any[];
  streaming?: boolean;
};

type ArticleReference = {
  sourceId: string;
  title: string;
  url?: string | null;
  excerpt: string;
  topic?: string | null;
  chunks: { chunkId: string; heading?: string | null; score: number }[];
};

type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event?: any) => void) | null;
};
type RoomTheme = "light" | "dark";

function readSseBlocks(buffer: string) {
  const parts = buffer.split("\n\n");
  return {
    blocks: parts.slice(0, -1),
    remaining: parts[parts.length - 1] || "",
  };
}

function normalizeTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForSimilarity(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyEcho(candidate: string, messages: SidebarMessage[]) {
  const normalizedCandidate = normalizeForSimilarity(candidate);
  if (normalizedCandidate.length < 24) return false;

  const assistantTurns = messages
    .filter((message) => message.role === "assistant" && !message.streaming)
    .slice(-2)
    .map((message) => normalizeForSimilarity(message.content))
    .filter(Boolean);

  return assistantTurns.some((assistantText) => {
    if (!assistantText) return false;
    if (assistantText.includes(normalizedCandidate) || normalizedCandidate.includes(assistantText)) {
      return true;
    }

    const candidateWords = new Set(normalizedCandidate.split(" ").filter(Boolean));
    const assistantWords = new Set(assistantText.split(" ").filter(Boolean));
    const overlap = Array.from(candidateWords).filter((word) => assistantWords.has(word)).length;
    const ratio = overlap / Math.max(candidateWords.size, 1);

    return ratio >= 0.82 && Math.abs(candidateWords.size - assistantWords.size) <= 6;
  });
}

export function LiveConversationSidebar({
  character,
  theme = "light",
}: {
  character: any;
  theme?: RoomTheme;
}) {
  const [messages, setMessages] = useState<SidebarMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);

  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const pendingSegmentsRef = useRef<string[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<SidebarMessage[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const autoCaptureEnabledRef = useRef(true);
  const shouldAutoRestartRef = useRef(true);
  const supportsSpeech = useMemo(
    () => typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window),
    []
  );
  const isLight = theme === "light";

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, interimTranscript]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    autoCaptureEnabledRef.current = autoCaptureEnabled;
  }, [autoCaptureEnabled]);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;

    processingRef.current = true;
    const nextMessage = queueRef.current.shift();
    if (!nextMessage) {
      processingRef.current = false;
      return;
    }

    setLoading(true);
    const userMessageId = `u_${Date.now()}`;
    const assistantMessageId = `a_${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", content: nextMessage },
      { id: assistantMessageId, role: "assistant", content: "", streaming: true },
    ]);

    const history = messagesRef.current
      .filter((message) => !message.streaming)
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.content }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          message: nextMessage,
          history,
          voiceEnabled: false,
          sessionId: `runway_sidebar_${character.id}`,
          conversationId: conversationIdRef.current,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`API ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let sources: any[] = [];
      let articles: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parsed = readSseBlocks(buffer);
        buffer = parsed.remaining;

        for (const block of parsed.blocks) {
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
              full += data.chunk || "";
              setMessages((current) =>
                current.map((message) => (message.id === assistantMessageId ? { ...message, content: full } : message))
              );
              break;
            case "sources":
              sources = data;
              break;
            case "articles":
              articles = data;
              break;
            case "done":
              if (data.conversationId) setConversationId(data.conversationId);
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessageId ? { ...message, streaming: false, sources, articles } : message
                )
              );
              break;
            case "error":
              console.error("[LiveConversationSidebar] Chat error:", data.error);
              break;
          }
        }
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId ? { ...message, content: full || message.content, streaming: false, sources, articles } : message
        )
      );
    } catch (error) {
      console.error("[LiveConversationSidebar] Failed:", error);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: "Companion analysis failed for this turn. Try asking again.", streaming: false }
            : message
        )
      );
    } finally {
      processingRef.current = false;
      setLoading(queueRef.current.length > 0);
      if (queueRef.current.length > 0) {
        void processQueue();
      }
    }
  }, [character.id]);

  const enqueueMessage = useCallback(
    (value: string) => {
      const trimmed = normalizeTranscript(value);
      if (!trimmed) return;
      queueRef.current.push(trimmed);
      setInput("");
      void processQueue();
    },
    [processQueue]
  );

  const flushCapturedTurn = useCallback(() => {
    clearFlushTimer();

    const finalized = normalizeTranscript(pendingSegmentsRef.current.join(" "));
    pendingSegmentsRef.current = [];
    setInterimTranscript("");

    if (!finalized || loadingRef.current) return;
    if (isLikelyEcho(finalized, messagesRef.current)) {
      return;
    }

    enqueueMessage(finalized);
  }, [clearFlushTimer, enqueueMessage]);

  const stopRecognition = useCallback(
    (restart = false) => {
      shouldAutoRestartRef.current = restart;
      clearRestartTimer();
      clearFlushTimer();

      const recognition = recognitionRef.current;
      recognitionRef.current = null;

      if (recognition) {
        recognition.stop();
      }

      setListening(false);
      setInterimTranscript("");
    },
    [clearFlushTimer, clearRestartTimer]
  );

  const startRecognition = useCallback(() => {
    if (!supportsSpeech || recognitionRef.current || !autoCaptureEnabledRef.current || loadingRef.current) return;

    const RecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    clearRestartTimer();
    setCaptureError("");
    shouldAutoRestartRef.current = true;

    const recognition: RecognitionInstance = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let receivedFinalSegment = false;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript?.trim();
        if (!transcript) continue;

        if (event.results[i].isFinal) {
          pendingSegmentsRef.current.push(transcript);
          receivedFinalSegment = true;
        } else {
          interim += `${transcript} `;
        }
      }

      setInterimTranscript(
        [...pendingSegmentsRef.current, interim.trim()].filter(Boolean).join(" ")
      );

      if (receivedFinalSegment) {
        clearFlushTimer();
        flushTimerRef.current = window.setTimeout(() => {
          flushCapturedTurn();
        }, 1200);
      }
    };

    recognition.onerror = (event?: any) => {
      if (event?.error === "aborted" || event?.error === "no-speech") return;

      setCaptureError("Auto voice capture paused in this tab. You can still type below, or tap resume to retry.");
      pendingSegmentsRef.current = [];
      setInterimTranscript("");
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      clearFlushTimer();

      if (pendingSegmentsRef.current.length > 0) {
        flushCapturedTurn();
      } else {
        setInterimTranscript("");
      }

      if (shouldAutoRestartRef.current && autoCaptureEnabledRef.current && !loadingRef.current) {
        restartTimerRef.current = window.setTimeout(() => {
          startRecognition();
        }, 450);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch (error) {
      console.error("[LiveConversationSidebar] Speech start failed:", error);
      setCaptureError("Auto voice capture could not start in this browser tab.");
      recognitionRef.current = null;
      setListening(false);
    }
  }, [clearFlushTimer, clearRestartTimer, flushCapturedTurn, supportsSpeech]);

  useEffect(() => {
    if (!supportsSpeech) return;

    if (!autoCaptureEnabled || loading) {
      if (loading) {
        flushCapturedTurn();
      }
      stopRecognition(false);
      return;
    }

    startRecognition();
  }, [autoCaptureEnabled, flushCapturedTurn, loading, startRecognition, stopRecognition, supportsSpeech]);

  useEffect(
    () => () => {
      shouldAutoRestartRef.current = false;
      clearFlushTimer();
      clearRestartTimer();
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    },
    [clearFlushTimer, clearRestartTimer]
  );

  const captureStatusLabel = !supportsSpeech
    ? "Voice auto-capture unavailable in this browser"
    : !autoCaptureEnabled
      ? "Auto voice capture paused"
      : loading
        ? `${character.name} is replying`
        : listening
          ? "Auto listening for your next turn"
          : "Reconnecting to your mic";

  return (
    <aside
      className={cn(
        "flex h-[min(42rem,calc(100vh-10rem))] max-h-[calc(100vh-10rem)] min-w-0 flex-col overflow-hidden rounded-[30px] border backdrop-blur-2xl lg:h-full lg:max-h-full lg:min-h-0",
        isLight
          ? "border-white/75 bg-white/52 shadow-xl shadow-slate-200/70"
          : "border-white/10 bg-black/28 shadow-xl shadow-black/30"
      )}
    >
      <div className={cn("border-b px-5 py-4", isLight ? "border-slate-200/70" : "border-white/10")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className={cn(
                "flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em]",
                isLight ? "text-slate-400" : "text-emerald-100/65"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              transcript
            </div>
            <p className={cn("mt-2 text-sm leading-relaxed", isLight ? "text-slate-600" : "text-white/72")}>
              Live notes, source cards, and article previews that stay aligned with the room on the left.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoCaptureEnabled((current) => !current)}
            disabled={!supportsSpeech}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-medium transition-colors",
              autoCaptureEnabled
                ? isLight
                  ? "bg-emerald-500/12 text-emerald-700"
                  : "bg-emerald-400/15 text-emerald-100"
                : isLight
                  ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  : "bg-white/5 text-white/60 hover:bg-white/10",
              !supportsSpeech && "cursor-not-allowed opacity-50"
            )}
          >
            {autoCaptureEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {autoCaptureEnabled ? "Pause auto voice" : "Resume auto voice"}
          </button>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px]",
              isLight ? "border-slate-200 bg-white/70 text-slate-400" : "border-white/10 text-white/45"
            )}
          >
            {captureStatusLabel}
          </span>
        </div>

        {interimTranscript && (
          <p className={cn("mt-2 text-[12px]", isLight ? "text-slate-400" : "text-white/45")}>
            Hearing you: {interimTranscript}
          </p>
        )}
        {captureError && <p className={cn("mt-2 text-[12px]", isLight ? "text-amber-700" : "text-amber-200/85")}>{captureError}</p>}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4 scroll-smooth">
        <div className="flex gap-2.5">
          {character.avatarUrl ? (
            <img src={character.avatarUrl} alt="" className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-full bg-white/10 object-cover" />
          ) : (
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/70">
              {character.name?.[0]}
            </div>
          )}
          <div>
            <p className={cn("mb-0.5 text-[11px]", isLight ? "text-slate-400" : "text-white/40")}>{character.name}</p>
            <p className={cn("text-[13px] leading-relaxed", isLight ? "text-slate-600" : "text-white/65")}>
              Auto-capture keeps both speakers separated so the saved conversation stays readable.
            </p>
          </div>
        </div>

        {messages.length === 0 && (character.suggestedQuestions || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(character.suggestedQuestions || []).slice(0, 4).map((question: string, index: number) => (
              <button
                key={index}
                onClick={() => enqueueMessage(question)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[12px] transition-colors",
                  isLight
                    ? "bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                    : "border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                )}
              >
                {question}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={cn("flex gap-2.5", message.role === "user" && "flex-row-reverse")}>
            {message.role === "assistant" ? (
              character.avatarUrl ? (
                <img src={character.avatarUrl} alt="" className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-full bg-white/10 object-cover" />
              ) : (
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/70">
                  {character.name?.[0]}
                </div>
              )
            ) : (
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  isLight ? "bg-slate-900 text-white" : "bg-emerald-400/15 text-emerald-100"
                )}
              >
                You
              </div>
            )}

            <div className={cn("max-w-[88%]", message.role === "user" && "text-right")}>
              <p className={cn("mb-1 text-[11px]", isLight ? "text-slate-400" : "text-white/35")}>
                {message.role === "user" ? "You" : character.name}
              </p>
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed",
                  message.role === "user"
                    ? isLight
                      ? "bg-slate-900 text-white"
                      : "bg-emerald-400/14 text-white"
                    : isLight
                      ? "bg-white/78 text-slate-700 shadow-sm"
                      : "bg-white/6 text-white/76"
                )}
              >
                {message.streaming && !message.content ? (
                  <Loader2 className={cn("h-3.5 w-3.5 animate-spin", isLight ? "text-slate-400" : "text-white/40")} />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>

              {message.articles && message.articles.length > 0 && !message.streaming && (
                <div className="mt-3 space-y-2">
                  {message.articles.map((article: ArticleReference) => (
                    <div
                      key={article.sourceId}
                      className={cn(
                        "overflow-hidden rounded-[22px] border transition-colors",
                        isLight
                          ? "border-white/70 bg-white/60 hover:bg-white/75"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      )}
                    >
                      <button
                        onClick={() => setExpandedArticle(expandedArticle === article.sourceId ? null : article.sourceId)}
                        className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl",
                            isLight ? "bg-slate-100 text-slate-500" : "bg-white/10"
                          )}
                        >
                          <FileText className={cn("h-4 w-4", isLight ? "text-slate-500" : "text-white/55")} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("line-clamp-2 text-[12px] font-medium leading-relaxed", isLight ? "text-slate-800" : "text-white/82")}>
                            {article.title}
                          </p>
                          <p className={cn("mt-1 line-clamp-2 text-[11px] leading-relaxed", isLight ? "text-slate-500" : "text-white/45")}>
                            {article.excerpt}
                          </p>
                          {article.topic && (
                            <span
                              className={cn(
                                "mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px]",
                                isLight ? "bg-slate-100 text-slate-500" : "bg-white/10 text-white/55"
                              )}
                            >
                              {article.topic}
                            </span>
                          )}
                        </div>
                        <ChevronRight
                          className={cn(
                            "mt-1 h-3.5 w-3.5 flex-shrink-0 transition-transform",
                            isLight ? "text-slate-400" : "text-white/30",
                            expandedArticle === article.sourceId && "rotate-90"
                          )}
                        />
                      </button>

                      {expandedArticle === article.sourceId && (
                        <div className={cn("border-t px-3.5 py-3", isLight ? "border-slate-200/70" : "border-white/10")}>
                          <div className="space-y-1.5">
                            {article.chunks.map((chunk) => (
                              <div key={chunk.chunkId}>
                                {chunk.heading && (
                                  <p className={cn("text-[10px] font-medium", isLight ? "text-slate-600" : "text-white/58")}>{chunk.heading}</p>
                                )}
                                <p className={cn("text-[10px]", isLight ? "text-slate-400" : "text-white/35")}>
                                  Relevance: {Math.round(chunk.score * 100)}%
                                </p>
                              </div>
                            ))}
                          </div>
                          {article.url && (
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "mt-3 inline-flex items-center gap-1.5 text-[11px] transition-colors",
                                isLight ? "text-sky-600 hover:text-sky-700" : "text-emerald-200 hover:text-emerald-100"
                              )}
                            >
                              Open original article
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.sources.map((source: any, index: number) => (
                    <a
                      key={index}
                      href={source.sourceUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors",
                        isLight
                          ? "bg-white/85 text-slate-500 hover:text-slate-700"
                          : "bg-white/8 text-white/48 hover:text-white/70"
                      )}
                    >
                      <BookOpen className="h-2.5 w-2.5" />
                      {source.sourceTitle?.slice(0, 24)}…
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          enqueueMessage(input);
        }}
        className={cn("border-t px-4 py-3", isLight ? "border-slate-200/70" : "border-white/10")}
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={loading ? `${character.name} is replying…` : "Type here if you want to log or clarify a turn manually…"}
            className={cn(
              "h-10 flex-1 rounded-2xl border px-3.5 text-sm outline-none transition-colors",
              isLight
                ? "border-slate-200 bg-[#faf8f4] text-slate-900 placeholder:text-slate-400 focus:border-slate-300"
                : "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-white/20"
            )}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl transition-colors disabled:opacity-30",
              isLight ? "bg-slate-900 text-white hover:bg-slate-700" : "bg-white/10 text-white/70 hover:bg-white/15"
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className={cn("mt-2 flex items-center gap-1.5 text-[11px]", isLight ? "text-slate-400" : "text-white/35")}>
          <AudioLines className="h-3.5 w-3.5" />
          Auto voice capture keeps the transcript moving; typing remains available for corrections or edge cases.
        </div>
      </form>
    </aside>
  );
}
