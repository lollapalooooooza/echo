"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Users, MessageCircle, Loader2, Sparkles, Radio } from "lucide-react";
import { formatNumber, cn } from "@/lib/utils";

const toneCfg: Record<string, { label: string; color: string; bg: string }> = {
  friendly: { label: "Friendly", color: "text-emerald-700", bg: "bg-emerald-50" },
  professional: { label: "Professional", color: "text-blue-700", bg: "bg-blue-50" },
  casual: { label: "Casual", color: "text-amber-700", bg: "bg-amber-50" },
  witty: { label: "Witty", color: "text-purple-700", bg: "bg-purple-50" },
  academic: { label: "Academic", color: "text-indigo-700", bg: "bg-indigo-50" },
  storyteller: { label: "Storyteller", color: "text-rose-700", bg: "bg-rose-50" },
};

const TONES = ["all", ...Object.keys(toneCfg)];

export default function LobbyPage() {
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTone, setActiveTone] = useState("all");

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((d) => {
        setCharacters(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = characters.filter((c) => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.bio.toLowerCase().includes(search.toLowerCase());
    const matchTone = activeTone === "all" || c.personalityTone === activeTone;
    return matchSearch && matchTone;
  });

  return (
    <div className="min-h-screen bg-[hsl(0_0%_99%)]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900">
              <span className="text-[11px] font-bold text-white">E</span>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Echo</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1">
              <Radio className="h-3 w-3 text-emerald-600" />
              <span className="text-[11px] font-medium text-emerald-700">{characters.length} Live</span>
            </div>
            <Link href="/creator" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Hero section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Character Lobby</span>
          </div>
          <h1 className="text-[2rem] font-semibold tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Discover AI characters.
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground max-w-lg">
            Each character is powered by real knowledge. Start a live conversation to learn directly from their expertise.
          </p>
        </div>

        {/* Search + filters */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search characters…"
              className="h-10 w-full rounded-xl border border-border/60 bg-white pl-10 pr-4 text-sm outline-none transition-colors focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTone(t)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12px] font-medium capitalize transition-all",
                  activeTone === t
                    ? "bg-neutral-900 text-white shadow-sm"
                    : "bg-white text-muted-foreground border border-border/60 hover:border-neutral-300 hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Character Grid */}
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground/40" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground mb-2">No characters found.</p>
            <Link href="/creator/character/new" className="text-sm font-medium text-foreground underline underline-offset-4 decoration-neutral-300 hover:decoration-neutral-500">
              Create the first one
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c: any) => {
              const tone = toneCfg[c.personalityTone] || toneCfg.friendly;
              return (
                <Link
                  key={c.id}
                  href={`/room/${c.slug}`}
                  className="group relative flex flex-col rounded-2xl border border-border/50 bg-white overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-neutral-200/60 hover:-translate-y-0.5"
                >
                  {/* Activity indicator */}
                  <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
                    <span className="live-dot" style={{ width: 6, height: 6 }} />
                    <span className="text-[10px] font-medium text-emerald-600">Live</span>
                  </div>

                  {/* Avatar area */}
                  <div className="flex items-center gap-4 px-5 pt-5 pb-3">
                    <div className="relative flex-shrink-0">
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt="" className="h-14 w-14 rounded-2xl object-cover shadow-sm ring-1 ring-border/30" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-lg font-semibold text-neutral-400 ring-1 ring-border/30">
                          {c.name?.[0]}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-semibold truncate leading-tight">{c.name}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium", tone.bg, tone.color)}>
                          {tone.label}
                        </span>
                        {c.user?.name && (
                          <span className="text-[11px] text-muted-foreground/70 truncate">by {c.user.name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bio */}
                  <div className="px-5 pb-3">
                    <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-2">{c.bio}</p>
                  </div>

                  {/* Greeting preview */}
                  {c.greeting && (
                    <div className="mx-5 mb-3 rounded-xl bg-neutral-50 px-3.5 py-2.5">
                      <p className="text-[12px] italic text-muted-foreground/80 line-clamp-2">&ldquo;{c.greeting}&rdquo;</p>
                    </div>
                  )}

                  {/* Suggested prompts */}
                  {c.suggestedQuestions?.length > 0 && (
                    <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                      {c.suggestedQuestions.slice(0, 2).map((q: string, i: number) => (
                        <span key={i} className="rounded-lg bg-neutral-100/80 px-2.5 py-1 text-[11px] text-muted-foreground truncate max-w-[180px]">
                          {q}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-auto flex items-center justify-between border-t border-border/30 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                        <MessageCircle className="h-3 w-3" />
                        {formatNumber(c._count?.conversations || 0)}
                      </span>
                    </div>
                    <span className="text-[12px] font-medium text-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Start talking &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
