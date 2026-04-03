"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, MessageCircle, Loader2, Mic, Radio, Search, Sparkles, Users, X } from "lucide-react";
import { formatNumber, cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";

const toneCfg: Record<string, { label: string; color: string; bg: string }> = {
  friendly: { label: "Friendly", color: "text-emerald-700", bg: "bg-emerald-50" },
  professional: { label: "Professional", color: "text-blue-700", bg: "bg-blue-50" },
  casual: { label: "Casual", color: "text-amber-700", bg: "bg-amber-50" },
  witty: { label: "Witty", color: "text-purple-700", bg: "bg-purple-50" },
  academic: { label: "Academic", color: "text-indigo-700", bg: "bg-indigo-50" },
  storyteller: { label: "Storyteller", color: "text-rose-700", bg: "bg-rose-50" },
};

const TONES = ["all", ...Object.keys(toneCfg)];

function LobbyCharacterArt({ character }: { character: any }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (character.avatarUrl && !imageFailed) {
    return (
      <img
        src={character.avatarUrl}
        alt={character.name}
        onError={() => setImageFailed(true)}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200 text-5xl font-semibold text-neutral-400">
      {character.name?.[0]}
    </div>
  );
}

export default function LobbyPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTone, setActiveTone] = useState("all");
  const [podcastMode, setPodcastMode] = useState(false);
  const [podcastSelection, setPodcastSelection] = useState<string[]>([]);
  const [podcastTopic, setPodcastTopic] = useState("");

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

  const togglePodcastChar = (charId: string) => {
    setPodcastSelection((prev) => {
      if (prev.includes(charId)) return prev.filter((id) => id !== charId);
      if (prev.length >= 2) return [prev[1], charId];
      return [...prev, charId];
    });
  };

  const startPodcast = () => {
    if (podcastSelection.length !== 2) return;
    const params = new URLSearchParams({
      a: podcastSelection[0],
      b: podcastSelection[1],
      ...(podcastTopic.trim() ? { topic: podcastTopic.trim() } : {}),
    });
    router.push(`/podcast?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[hsl(0_0%_99%)]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <BrandMark href="/" size="sm" />
          <div className="flex items-center gap-3">
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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-5">
                <h1 className="text-[2rem] font-semibold tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }}>
                  Discover EchoNest characters.
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setPodcastMode((current) => !current);
                    setPodcastSelection([]);
                    setPodcastTopic("");
                  }}
                  className={cn(
                    "group relative inline-flex w-fit rounded-[28px] transition-transform duration-300 hover:-translate-y-1",
                    podcastMode
                      ? "scale-[1.01]"
                      : ""
                  )}
                  aria-label="Open podcast studio mode"
                >
                  <img
                    src="/podcasticon.png"
                    alt="Enter podcast studio"
                    className={cn(
                      "block h-[112px] w-auto drop-shadow-[0_18px_28px_rgba(92,53,22,0.2)] transition-transform duration-300 group-hover:scale-[1.02] sm:h-[132px]",
                      podcastMode ? "drop-shadow-[0_24px_38px_rgba(92,53,22,0.28)]" : ""
                    )}
                  />
                  <span
                    className={cn(
                      "absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
                      podcastMode
                        ? "bg-emerald-100/95 text-emerald-700"
                        : "bg-white/88 text-slate-700"
                    )}
                  >
                    {podcastMode ? `Open ${podcastSelection.length}/2` : "Studio"}
                  </span>
                </button>
              </div>
              <p className="mt-2 max-w-lg text-[15px] text-muted-foreground">
                Each character is powered by real knowledge. Start a live conversation to learn directly from their expertise.
              </p>
            </div>
          </div>
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

        {/* Podcast selection banner */}
        {podcastMode && (
          <div className="mb-6 rounded-[20px] border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-orange-600" />
                  <h3 className="text-sm font-semibold text-orange-900">Podcast Mode</h3>
                </div>
                <p className="mt-1 text-[13px] text-orange-700/80">
                  Select two characters below to open the podcast studio.
                </p>
              </div>
              <button
                onClick={() => { setPodcastMode(false); setPodcastSelection([]); setPodcastTopic(""); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600 hover:bg-orange-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="mb-1.5 block text-[12px] font-medium text-orange-800">Topic</label>
                <input
                  value={podcastTopic}
                  onChange={(e) => setPodcastTopic(e.target.value)}
                  placeholder="e.g. The future of AI in education..."
                  className="h-10 w-full rounded-xl border border-orange-200 bg-white px-3 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <button
                onClick={startPodcast}
                disabled={podcastSelection.length !== 2}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-orange-500 px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Mic className="h-3.5 w-3.5" />
                Start Podcast ({podcastSelection.length}/2)
              </button>
            </div>
            {podcastSelection.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {podcastSelection.map((id) => {
                  const c = characters.find((ch) => ch.id === id);
                  return c ? (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-[12px] font-medium text-orange-800">
                      {c.avatarUrl && <img src={c.avatarUrl} alt="" className="h-4 w-4 rounded-full object-cover" />}
                      {c.name}
                      <button onClick={() => togglePodcastChar(id)} className="ml-0.5 text-orange-500 hover:text-orange-700"><X className="h-3 w-3" /></button>
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

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
              const isPodcastSelected = podcastSelection.includes(c.id);

              const cardContent = (
                <>
                  <div className="relative aspect-[5/4] overflow-hidden bg-neutral-100">
                    <LobbyCharacterArt character={c} />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    {podcastMode && (
                      <div className={cn(
                        "absolute left-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all",
                        isPodcastSelected
                          ? "border-orange-400 bg-orange-500 text-white"
                          : "border-white/60 bg-black/30 backdrop-blur-sm"
                      )}>
                        {isPodcastSelected && <Check className="h-3.5 w-3.5" />}
                      </div>
                    )}
                    <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 backdrop-blur-sm">
                      <span className="live-dot" style={{ width: 6, height: 6 }} />
                      <span className="text-[10px] font-medium text-emerald-700">Live</span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold leading-tight">{c.name}</h3>
                        <div className="mt-1 flex items-center gap-2">
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", tone.bg, tone.color)}>
                            {tone.label}
                          </span>
                          {c.user?.name && (
                            <span className="truncate text-[11px] text-white/75">by {c.user.name}</span>
                          )}
                        </div>
                      </div>
                      <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">
                        {formatNumber(c._count?.conversations || 0)} chats
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{c.bio}</p>

                    {c.greeting && (
                      <div className="rounded-2xl bg-neutral-50 px-3.5 py-3">
                        <p className="line-clamp-2 text-[12px] italic text-muted-foreground/85">&ldquo;{c.greeting}&rdquo;</p>
                      </div>
                    )}

                    {c.suggestedQuestions?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {c.suggestedQuestions.slice(0, 2).map((q: string, i: number) => (
                          <span key={i} className="max-w-[220px] truncate rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-muted-foreground">
                            {q}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-border/40 pt-4">
                      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground/80">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {formatNumber(c._count?.conversations || 0)} conversations
                      </span>
                      {podcastMode ? (
                        <span className={cn(
                          "inline-flex items-center gap-1.5 text-[12px] font-medium",
                          isPodcastSelected ? "text-orange-600" : "text-foreground/80"
                        )}>
                          {isPodcastSelected ? "Selected" : "Tap to select"}{" "}
                          <Mic className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground/80">
                          Start talking <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </>
              );

              if (podcastMode) {
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => togglePodcastChar(c.id)}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-[28px] border bg-white text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-neutral-200/70",
                      isPodcastSelected
                        ? "border-orange-400 ring-2 ring-orange-200 shadow-lg shadow-orange-100/50"
                        : "border-border/50"
                    )}
                  >
                    {cardContent}
                  </button>
                );
              }

              return (
                <Link
                  key={c.id}
                  href={`/room/${c.slug}`}
                  className="group relative flex flex-col overflow-hidden rounded-[28px] border border-border/50 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-neutral-200/70"
                >
                  {cardContent}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
