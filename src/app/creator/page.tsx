"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Loader2,
  MessageCircle,
  Plus,
  Sparkles,
  User,
} from "lucide-react";

export default function CreatorDashboard() {
  const [sources, setSources] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/knowledge/sources").then((response) => response.json()),
      fetch("/api/characters?mine=true").then((response) => response.json()),
    ])
      .then(([sourceData, characterData]) => {
        setSources(Array.isArray(sourceData) ? sourceData : []);
        setCharacters(Array.isArray(characterData) ? characterData : []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const indexed = sources.filter((source) => source.status === "INDEXED").length;
  const totalConversations = characters.reduce((sum: number, character: any) => sum + (character._count?.conversations || 0), 0);

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-border/60 bg-[linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,41,59,0.9))] p-7 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-200/75">
              <Sparkles className="h-3.5 w-3.5" />
              Creator Dashboard
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Build better live characters from one place.
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/72">
              Track what your characters know, what users are asking, and which characters are actually pulling conversation weight.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/creator/character/new" className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-slate-900 transition-opacity hover:opacity-90">
              <Plus className="h-4 w-4" />
              New character
            </Link>
            <Link href="/creator/knowledge" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 text-sm font-medium text-white/82 transition-colors hover:bg-white/10">
              <BookOpen className="h-4 w-4" />
              Manage knowledge
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={BookOpen} label="Sources Indexed" value={indexed} href="/creator/knowledge" />
        <Stat icon={MessageCircle} label="Conversations" value={totalConversations} href="/creator/analytics" />
        <Stat icon={User} label="Characters" value={characters.length} href="/creator/character" />
        <Stat icon={BarChart3} label="Published" value={characters.filter((character: any) => character.status === "PUBLISHED").length} href="/creator/character" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-[28px] border border-border/60 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Your Characters</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">Recent updates, publish state, and conversation traction.</p>
            </div>
            <Link href="/creator/character/new" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <Plus className="h-3 w-3" />
              New
            </Link>
          </div>

          {characters.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">No characters yet.</p>
              <Link href="/creator/character/new" className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
                Create one
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {characters.slice(0, 4).map((character: any) => (
                <Link
                  key={character.id}
                  href={`/creator/character/${character.id}`}
                  className="group overflow-hidden rounded-[24px] border border-border/60 bg-[linear-gradient(180deg,rgba(250,250,250,1),rgba(245,245,245,0.82))] transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
                >
                  <div className="relative aspect-[5/4] overflow-hidden bg-neutral-100">
                    {character.avatarUrl ? (
                      <img src={character.avatarUrl} alt={character.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200 text-4xl font-semibold text-neutral-400">
                        {character.name?.[0]}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold">{character.name}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/72">{character.status}</p>
                      </div>
                      <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">
                        {character._count?.conversations || 0} chats
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{character.bio}</p>
                    <div className="flex items-center justify-between border-t border-border/40 pt-3">
                      <span className="text-[11px] text-muted-foreground">{character._count?.conversations || 0} recorded conversations</span>
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground/75">
                        Open
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-[28px] border border-border/60 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Quick Actions</h2>
            <div className="mt-4 space-y-2">
              <QA icon={BookOpen} label="Import knowledge" href="/creator/knowledge" />
              <QA icon={User} label="Create character" href="/creator/character/new" />
              <QA icon={BarChart3} label="View analytics" href="/creator/analytics" />
            </div>
          </div>

          <div className="rounded-[28px] border border-border/60 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Snapshot</h2>
            <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-muted-foreground">
              <p>{indexed} indexed sources are currently available for your characters to use.</p>
              <p>{totalConversations} conversations have already been recorded across your published and draft characters.</p>
              <p>Use the analytics tab to see which questions users keep returning to and which sources get cited most often.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, href }: { icon: any; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-[24px] border border-border/60 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
      <p className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

function QA({ icon: Icon, label, href }: { icon: any; label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-[13px] transition-colors hover:bg-muted/50">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
    </Link>
  );
}
