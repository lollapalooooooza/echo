"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, Volume2, X, BookOpen, Loader2, ExternalLink } from "lucide-react";

interface CharacterConfig {
  id: string; name: string; avatarUrl: string; bio: string; greeting: string;
  suggestedQuestions: string[]; voiceId: string; theme: string;
}

interface Msg { id: string; role: "user" | "assistant"; content: string; sources?: any[]; streaming?: boolean; }

export default function WidgetPage({ params }: { params: { characterId: string } }) {
  const [config, setConfig] = useState<CharacterConfig | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch(`/api/widget/${params.characterId}`)
      .then((r) => r.ok ? r.json() : Promise.reject("Not found"))
      .then(setConfig)
      .catch(() => setError("Character not found"));
  }, [params.characterId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading || !config) return;

    setMessages((p) => [...p, { id: `u${Date.now()}`, role: "user", content: text }]);
    setInput(""); setLoading(true);
    const aId = `a${Date.now()}`;
    setMessages((p) => [...p, { id: aId, role: "assistant", content: "", streaming: true }]);

    const history = messages.filter((m) => !m.streaming).slice(-8).map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: config.id, message: text, history, voiceEnabled: !!config.voiceId, sessionId: `widget_${Date.now()}` }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = ""; let sources: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const blocks = chunk.split("\n\n").filter(Boolean);

        for (const block of blocks) {
          const evtMatch = block.match(/^event: (.+)$/m);
          const dataMatch = block.match(/^data: (.+)$/m);
          if (!evtMatch || !dataMatch) continue;
          let data: any;
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }

          if (evtMatch[1] === "text") {
            full += data.chunk;
            setMessages((p) => p.map((m) => m.id === aId ? { ...m, content: full } : m));
          } else if (evtMatch[1] === "sources") {
            sources = data;
          } else if (evtMatch[1] === "audio" && audioRef.current) {
            const bytes = atob(data.audioBase64);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            const blob = new Blob([arr], { type: "audio/mpeg" });
            audioRef.current.src = URL.createObjectURL(blob);
            audioRef.current.play().catch(() => {});
          } else if (evtMatch[1] === "done") {
            setMessages((p) => p.map((m) => m.id === aId ? { ...m, streaming: false, sources } : m));
          }
        }
      }
      setMessages((p) => p.map((m) => m.id === aId ? { ...m, streaming: false, sources } : m));
    } catch {
      setMessages((p) => p.map((m) => m.id === aId ? { ...m, content: "Connection error.", streaming: false } : m));
    } finally { setLoading(false); }
  }, [loading, config, messages]);

  if (error) return <div className="flex h-screen items-center justify-center text-sm text-red-500">{error}</div>;
  if (!config) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="flex h-screen flex-col bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <audio ref={audioRef} />

      {/* Header */}
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        {config.avatarUrl && <img src={config.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-gray-100" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{config.name}</p>
          <p className="text-[11px] text-gray-500 truncate">{config.bio.slice(0, 50)}…</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Greeting */}
        <div className="rounded-xl rounded-tl-sm bg-gray-50 px-3 py-2.5 text-[13px] leading-relaxed text-gray-700">{config.greeting}</div>

        {/* Suggestions */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(config.suggestedQuestions || []).slice(0, 4).map((q: string, i: number) => (
              <button key={i} onClick={() => send(q)} className="rounded-full border px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50">{q}</button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${
              m.role === "user" ? "ml-auto rounded-tr-sm bg-black text-white" : "rounded-tl-sm bg-gray-50 text-gray-700"
            }`}>
              {m.streaming && !m.content ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
            {m.sources && m.sources.length > 0 && !m.streaming && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.sources.map((s: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    <BookOpen className="h-2.5 w-2.5" />{s.sourceTitle?.slice(0, 25)}…
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2.5">
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} disabled={loading}
            placeholder="Ask a question…" className="h-9 flex-1 rounded-lg border px-3 text-sm outline-none focus:border-gray-400 disabled:opacity-50" />
          <button disabled={!input.trim() || loading} className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white disabled:opacity-30">
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-1.5 text-center text-[9px] text-gray-400">Powered by <a href="/" target="_blank" className="underline">Echo</a></p>
      </div>
    </div>
  );
}
