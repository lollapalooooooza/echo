"use client";

import { useEffect, useState } from "react";
import {
  BookOpenText,
  Loader2,
  MessageCircle,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { formatNumber } from "@/lib/utils";

type AnalyticsPayload = {
  totals: {
    totalConversations: number;
    totalMessages: number;
    characterCount: number;
    publishedCount: number;
  };
  digest: {
    overview: string;
    topTopics: string[];
    commonQuestions: string[];
    interestingMoments: string[];
  };
  characters: Array<{
    id: string;
    name: string;
    slug: string;
    avatarUrl?: string | null;
    bio: string;
    status: string;
    conversationCount: number;
    messageCount: number;
    recentQuestions: string[];
    interestingMoments: string[];
    topSources: Array<{ title: string; url?: string | null; count: number }>;
    lastActiveAt: string;
  }>;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/overview")
      .then((response) => response.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Unable to load analytics.</div>;
  }

  const { totals, digest, characters } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent questions, cited articles, and conversation patterns across your characters.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={MessageCircle} label="Total Conversations" value={formatNumber(totals.totalConversations)} />
        <MetricCard icon={TrendingUp} label="Tracked Messages" value={formatNumber(totals.totalMessages)} />
        <MetricCard icon={Sparkles} label="Active Characters" value={formatNumber(totals.characterCount)} />
        <MetricCard icon={BookOpenText} label="Published" value={formatNumber(totals.publishedCount)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[28px] border border-border/60 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
            <Sparkles className="h-3.5 w-3.5" />
            Owner Digest
          </div>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-foreground/85">{digest.overview}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <InsightList title="Top Topics" items={digest.topTopics} />
            <InsightList title="Common Questions" items={digest.commonQuestions} />
            <InsightList title="Interesting Moments" items={digest.interestingMoments} />
          </div>
        </section>

        <section className="rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88))] p-6 text-white shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/55">What owners can see</p>
          <div className="mt-5 space-y-4 text-sm leading-6 text-white/72">
            <p>Recent user asks are now stored and surfaced back here through the conversation log.</p>
            <p>Referenced source cards show which articles or documents your character leaned on most often.</p>
            <p>Runway live sessions can now keep a parallel companion transcript so the owner still gets searchable conversation insights.</p>
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            By Character
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Recent asks, cited reading, and notable answer moments for each character.</p>
        </div>

        {characters.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No characters yet.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {characters.map((character) => (
              <article key={character.id} className="rounded-[28px] border border-border/60 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  {character.avatarUrl ? (
                    <img src={character.avatarUrl} alt="" className="h-14 w-14 rounded-2xl bg-muted object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-sm font-semibold">
                      {character.name?.[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[16px] font-semibold">{character.name}</h3>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600">
                        {character.status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{character.bio}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                      {character.conversationCount}
                    </p>
                    <p className="text-[11px] text-muted-foreground">conversations</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <CharacterList title="Recent Questions" items={character.recentQuestions} empty="No recent user questions yet." />
                  <CharacterList title="Interesting Answers" items={character.interestingMoments} empty="No standout answer moments yet." />
                  <CharacterSources title="Referenced Sources" items={character.topSources} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-border/60 bg-white p-5 shadow-sm">
      <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
      <p className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/75">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <span key={index} className="rounded-full bg-white px-3 py-1.5 text-[12px] text-foreground/80 shadow-sm">
              {item}
            </span>
          ))
        ) : (
          <p className="text-[12px] text-muted-foreground">Not enough recent data yet.</p>
        )}
      </div>
    </div>
  );
}

function CharacterList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/75">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <p key={index} className="rounded-xl bg-white px-3 py-2 text-[12px] leading-relaxed text-foreground/80 shadow-sm">
              {item}
            </p>
          ))
        ) : (
          <p className="text-[12px] text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  );
}

function CharacterSources({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; url?: string | null; count: number }>;
}) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/75">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <div key={index} className="rounded-xl bg-white px-3 py-2 shadow-sm">
              <p className="line-clamp-2 text-[12px] font-medium leading-relaxed text-foreground/80">{item.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.count} cited message{item.count === 1 ? "" : "s"}</p>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-muted-foreground">No cited documents yet.</p>
        )}
      </div>
    </div>
  );
}
