"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  MicOff,
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

function readSseBlocks(buffer: string) {
  const parts = buffer.split("\n\n");
  return {
    blocks: parts.slice(0, -1),
    remaining: parts[parts.length - 1] || "",
  };
}

export function LiveConversationSidebar({ character }: { character: any }) {
  const [messages, setMessages] = useState<SidebarMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [captureError, setCaptureError] = useState("");

  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const capturedSegmentsRef = useRef<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<SidebarMessage[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const supportsSpeech = useMemo(
    () => typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window),
    []
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interimTranscript]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

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
      const trimmed = value.replace(/\s+/g, " ").trim();
      if (!trimmed) return;
      queueRef.current.push(trimmed);
      setInput("");
      void processQueue();
    },
    [processQueue]
  );

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    if (!supportsSpeech || recognitionRef.current || loading) return;

    const RecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    const recognition: RecognitionInstance = new RecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    capturedSegmentsRef.current = [];
    setInterimTranscript("");

    recognition.onresult = (event: any) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript?.trim();
        if (!transcript) continue;

        if (event.results[i].isFinal) {
          capturedSegmentsRef.current.push(transcript);
        } else {
          interim += `${transcript} `;
        }
      }

      setInterimTranscript([...capturedSegmentsRef.current, interim.trim()].filter(Boolean).join(" "));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      const finalized = capturedSegmentsRef.current.join(" ").replace(/\s+/g, " ").trim();
      capturedSegmentsRef.current = [];
      setInterimTranscript("");
      if (finalized) {
        enqueueMessage(finalized);
      }
    };

    recognition.onerror = (event?: any) => {
      if (event?.error === "aborted") return;
      setCaptureError("Voice capture stopped before your turn finished. You can type instead or try recording again.");
      capturedSegmentsRef.current = [];
      recognitionRef.current = null;
      setListening(false);
      setInterimTranscript("");
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
      setCaptureError("");
    } catch (error) {
      console.error("[LiveConversationSidebar] Speech start failed:", error);
      setCaptureError("Voice capture could not start in this browser tab.");
      capturedSegmentsRef.current = [];
      recognitionRef.current = null;
      setListening(false);
    }
  }, [enqueueMessage, loading, supportsSpeech]);

  useEffect(() => {
    if (loading && recognitionRef.current) {
      stopRecognition();
    }
  }, [loading, stopRecognition]);

  useEffect(() => () => stopRecognition(), [stopRecognition]);

  return (
    <aside className="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-black/30 backdrop-blur-sm">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-100/65">
              <Sparkles className="h-3.5 w-3.5" />
              Dual-Channel Transcript
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/72">
              User turns and character turns now stay in separate lanes. We only record your side when you press the mic, then stream the character reply back into its own thread.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (listening) {
                stopRecognition();
              } else {
                startRecognition();
              }
            }}
            disabled={!supportsSpeech || loading}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-medium transition-colors",
              listening
                ? "bg-emerald-400/15 text-emerald-100"
                : "bg-white/5 text-white/60 hover:bg-white/10",
              (!supportsSpeech || loading) && "cursor-not-allowed opacity-50"
            )}
          >
            {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {listening ? "Stop recording your turn" : "Record your turn"}
          </button>
          {supportsSpeech ? (
            <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/45">
              {listening
                ? "Listening to your mic only"
                : loading
                  ? `${character.name} is replying`
                  : "Press record when it is your turn"}
            </span>
          ) : (
            <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/45">
              Voice capture unavailable in this browser
            </span>
          )}
        </div>
        {interimTranscript && <p className="mt-2 text-[12px] text-white/45">Your turn: {interimTranscript}</p>}
        {captureError && <p className="mt-2 text-[12px] text-amber-200/85">{captureError}</p>}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="flex gap-2.5">
          {character.avatarUrl ? (
            <img src={character.avatarUrl} alt="" className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-full bg-white/10 object-cover" />
          ) : (
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/70">
              {character.name?.[0]}
            </div>
          )}
          <div>
            <p className="mb-0.5 text-[11px] text-white/40">{character.name}</p>
            <p className="text-[13px] leading-relaxed text-white/65">
              Ask here for a saved transcript, source cards, and owner analytics without blending your voice with the character.
            </p>
          </div>
        </div>

        {messages.length === 0 && (character.suggestedQuestions || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(character.suggestedQuestions || []).slice(0, 4).map((question: string, index: number) => (
              <button
                key={index}
                onClick={() => enqueueMessage(question)}
                className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/20 hover:bg-white/10"
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
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[11px] font-semibold text-emerald-100">
                You
              </div>
            )}

            <div className={cn("max-w-[88%]", message.role === "user" && "text-right")}>
              <p className="mb-1 text-[11px] text-white/35">{message.role === "user" ? "You" : character.name}</p>
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed",
                  message.role === "user" ? "bg-emerald-400/14 text-white" : "bg-white/6 text-white/76"
                )}
              >
                {message.streaming && !message.content ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>

              {message.articles && message.articles.length > 0 && !message.streaming && (
                <div className="mt-3 space-y-2">
                  {message.articles.map((article: ArticleReference) => (
                    <div
                      key={article.sourceId}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-colors hover:border-white/20"
                    >
                      <button
                        onClick={() => setExpandedArticle(expandedArticle === article.sourceId ? null : article.sourceId)}
                        className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                      >
                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/10">
                          <FileText className="h-4 w-4 text-white/55" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[12px] font-medium leading-relaxed text-white/82">{article.title}</p>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/45">{article.excerpt}</p>
                          {article.topic && (
                            <span className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/55">
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
                      </button>

                      {expandedArticle === article.sourceId && (
                        <div className="border-t border-white/10 px-3.5 py-3">
                          <div className="space-y-1.5">
                            {article.chunks.map((chunk) => (
                              <div key={chunk.chunkId}>
                                {chunk.heading && <p className="text-[10px] font-medium text-white/58">{chunk.heading}</p>}
                                <p className="text-[10px] text-white/35">Relevance: {Math.round(chunk.score * 100)}%</p>
                              </div>
                            ))}
                          </div>
                          {article.url && (
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-emerald-200 transition-colors hover:text-emerald-100"
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
                      className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/48 transition-colors hover:text-white/70"
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
        className="border-t border-white/10 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={loading ? `${character.name} is replying…` : "Type your next turn to log it clearly…"}
            className="h-10 flex-1 rounded-2xl border border-white/10 bg-white/5 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/20"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/70 transition-colors hover:bg-white/15 disabled:opacity-30"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
