"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  Clock3,
  ExternalLink,
  Loader2,
  MessageCircle,
  Sparkles,
  Tags,
  TrendingUp,
  X,
} from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

type AnalyticsMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  sourcesJson?: any;
};

type ConversationPreview = {
  id: string;
  characterId: string;
  characterName: string;
  characterSlug: string;
  characterAvatarUrl?: string | null;
  startedAt: string;
  endedAt?: string | null;
  title: string;
  summary: string;
  keywords: string[];
  topSources: Array<{ title: string; url?: string | null; count: number }>;
  messageCount: number;
  messages: AnalyticsMessage[];
};

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
  recentConversations: ConversationPreview[];
  characters: Array<{
    id: string;
    name: string;
    slug: string;
    avatarUrl?: string | null;
    bio: string;
    status: string;
    headline: string;
    keywords: string[];
    conversationCount: number;
    messageCount: number;
    recentQuestions: string[];
    interestingMoments: string[];
    topSources: Array<{ title: string; url?: string | null; count: number }>;
    lastActiveAt: string;
    recentConversations: ConversationPreview[];
  }>;
};

type Signal = {
  type: "topic" | "question" | "moment";
  value: string;
};

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return formatter.format(days, "day");

  const weeks = Math.round(days / 7);
  if (Math.abs(weeks) < 5) return formatter.format(weeks, "week");

  const months = Math.round(days / 30);
  return formatter.format(months, "month");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function conversationMatchesSignal(conversation: ConversationPreview, signal: Signal | null) {
  if (!signal) return true;
  const target = normalize(signal.value);
  const searchable = [
    conversation.title,
    conversation.summary,
    ...conversation.keywords,
    ...conversation.topSources.map((source) => source.title),
    ...conversation.messages.map((message) => message.content),
  ]
    .join(" ")
    .toLowerCase();

  return searchable.includes(target);
}

function dedupeConversations(conversations: ConversationPreview[]) {
  const seen = new Set<string>();
  return conversations.filter((conversation) => {
    if (seen.has(conversation.id)) return false;
    seen.add(conversation.id);
    return true;
  });
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSignal, setActiveSignal] = useState<Signal | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<ConversationPreview | null>(null);
  const [activeDigestTab, setActiveDigestTab] = useState<"topics" | "questions" | "moments">("topics");
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);

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
  const filteredRecentConversations = dedupeConversations(data.recentConversations).filter((conversation) =>
    conversationMatchesSignal(conversation, activeSignal)
  );
  const filteredCharacters = characters.filter((character) => {
    if (!activeSignal) return true;
    const characterText = [character.name, character.headline, ...character.keywords, ...character.recentQuestions, ...character.interestingMoments]
      .join(" ")
      .toLowerCase();
    return (
      characterText.includes(normalize(activeSignal.value)) ||
      character.recentConversations.some((conversation) => conversationMatchesSignal(conversation, activeSignal))
    );
  });
  const digestTabs = [
    {
      key: "topics" as const,
      icon: Tags,
      title: "Keyword Radar",
      subtitle: "Core themes users keep circling back to",
      items: digest.topTopics,
      signalType: "topic" as const,
    },
    {
      key: "questions" as const,
      icon: MessageCircle,
      title: "Question Signals",
      subtitle: "Repeat asks worth turning into stronger flows",
      items: digest.commonQuestions,
      signalType: "question" as const,
    },
    {
      key: "moments" as const,
      icon: BarChart3,
      title: "Answer Highlights",
      subtitle: "Memorable responses and notable moments",
      items: digest.interestingMoments,
      signalType: "moment" as const,
    },
  ];
  const activeDigest = digestTabs.find((tab) => tab.key === activeDigestTab) || digestTabs[0];
  const ActiveDigestIcon = activeDigest.icon;
  const resolvedCharacterId =
    activeCharacterId && filteredCharacters.some((character) => character.id === activeCharacterId)
      ? activeCharacterId
      : filteredCharacters[0]?.id || null;
  const selectedCharacter =
    filteredCharacters.find((character) => character.id === resolvedCharacterId) ||
    filteredCharacters[0] ||
    null;
  const selectedCharacterConversations = selectedCharacter
    ? selectedCharacter.recentConversations.filter((conversation) =>
        conversationMatchesSignal(conversation, activeSignal)
      )
    : [];

  return (
    <>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Analytics
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              See the themes users keep returning to, inspect recent chat history, and jump from signals into the exact conversations behind them.
            </p>
          </div>
          {activeSignal && (
            <button
              type="button"
              onClick={() => setActiveSignal(null)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border/60 bg-white px-4 text-sm text-foreground/75 shadow-sm transition-colors hover:bg-neutral-50"
            >
              <X className="h-4 w-4" />
              Clear filter: {activeSignal.value}
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={MessageCircle}
            label="Total Conversations"
            value={formatNumber(totals.totalConversations)}
            tone="from-amber-100 via-white to-white"
          />
          <MetricCard
            icon={TrendingUp}
            label="Tracked Messages"
            value={formatNumber(totals.totalMessages)}
            tone="from-sky-100 via-white to-white"
          />
          <MetricCard
            icon={Sparkles}
            label="Active Characters"
            value={formatNumber(totals.characterCount)}
            tone="from-emerald-100 via-white to-white"
          />
          <MetricCard
            icon={BookOpenText}
            label="Published"
            value={formatNumber(totals.publishedCount)}
            tone="from-rose-100 via-white to-white"
          />
        </div>

        <section className="overflow-hidden rounded-[34px] border border-amber-200/60 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_48%,#fffbeb_100%)] shadow-[0_24px_90px_-52px_rgba(217,119,6,0.45)]">
          <div className="border-b border-amber-200/60 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-amber-700/70">
                  <Sparkles className="h-3.5 w-3.5" />
                  User Digest
                </div>
                <p className="mt-4 max-w-4xl text-[15px] leading-7 text-slate-800/85">{digest.overview}</p>
              </div>
              <div className="rounded-full border border-amber-200/80 bg-white/90 px-3 py-1 text-[11px] text-amber-700/80 shadow-sm">
                {activeDigest.items.length} signals
              </div>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {digestTabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.key === activeDigestTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveDigestTab(tab.key)}
                    className={cn(
                      "inline-flex min-w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-slate-900 text-white"
                        : "border border-amber-200/80 bg-white/85 text-slate-700 hover:bg-amber-50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.title}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6 p-6 xl:grid-cols-[0.72fr_1.28fr]">
            <div className="rounded-[28px] border border-amber-200/70 bg-white/90 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-700/75">
                <ActiveDigestIcon className="h-3.5 w-3.5" />
                {activeDigest.title}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{activeDigest.subtitle}</p>
              {activeSignal && (
                <div className="mt-5 rounded-[22px] bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                  Current filter: <span className="font-medium">{activeSignal.value}</span>
                </div>
              )}
              <div className="mt-5 space-y-3">
                <MiniMetric label="Visible threads" value={formatNumber(filteredRecentConversations.length)} />
                <MiniMetric label="Characters matched" value={formatNumber(filteredCharacters.length)} />
              </div>
            </div>

            <div className="rounded-[28px] border border-amber-200/70 bg-white/80 p-4 shadow-sm">
              <div className="max-h-[28rem] overflow-y-auto pr-1">
                {activeDigest.items.length > 0 ? (
                  <div className="space-y-3">
                    {activeDigest.items.map((item) => {
                      const isActive = activeSignal?.value === item && activeSignal.type === activeDigest.signalType;
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() =>
                            setActiveSignal(isActive ? null : { type: activeDigest.signalType, value: item })
                          }
                          className={cn(
                            "w-full rounded-[24px] border p-4 text-left transition-colors",
                            isActive
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-amber-200/70 bg-white hover:bg-amber-50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-[15px] font-semibold">{item}</p>
                              <p className={cn("mt-2 text-[12px] leading-6", isActive ? "text-white/72" : "text-slate-500")}>
                                Tap to filter both the digest and the saved conversation history around this signal.
                              </p>
                            </div>
                            <ArrowRight className={cn("mt-1 h-4 w-4 flex-shrink-0", isActive ? "text-white/75" : "text-slate-400")} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-amber-200/80 px-4 py-12 text-center text-sm text-slate-500">
                    Not enough recent data yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[34px] border border-slate-200/70 bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] p-6 text-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.85)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/45">Recent Conversation Trails</p>
              <p className="mt-2 text-sm leading-6 text-white/72">
                Click any thread to inspect the saved chat history, pulled sources, and the exact user questions that led there.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/55">
              {filteredRecentConversations.length} visible
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {filteredRecentConversations.length > 0 ? (
              filteredRecentConversations.slice(0, 6).map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedConversation(conversation)}
                  className="group w-full rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                >
                  <div className="flex items-start gap-3">
                    {conversation.characterAvatarUrl ? (
                      <img src={conversation.characterAvatarUrl} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold text-white/70">
                        {conversation.characterName?.[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[14px] font-semibold text-white">{conversation.title}</p>
                        <span className="whitespace-nowrap text-[11px] text-white/42">{formatRelativeTime(conversation.startedAt)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-6 text-white/62">{conversation.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {conversation.keywords.slice(0, 3).map((keyword) => (
                          <span key={keyword} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100/88">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-white/45">
                    <span>{conversation.messageCount} messages</span>
                    <span className="inline-flex items-center gap-1 text-white/72">
                      Open chat history
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/45 xl:col-span-2">
                No recent conversations match the current filter.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                By Character
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A cleaner per-character view of what people ask, what answers stand out, and which saved chats deserve a closer look.
              </p>
            </div>
            <div className="rounded-full border border-border/60 bg-white px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
              {filteredCharacters.length} characters shown
            </div>
          </div>

          {filteredCharacters.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No characters match the current analytics filter.
            </div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {filteredCharacters.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => setActiveCharacterId(character.id)}
                    className={cn(
                      "inline-flex min-w-fit items-center gap-3 rounded-full border px-4 py-2 transition-colors",
                      selectedCharacter?.id === character.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-border bg-white text-slate-700 hover:bg-neutral-50"
                    )}
                  >
                    {character.avatarUrl ? (
                      <img src={character.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-[12px] font-semibold">
                        {character.name?.[0]}
                      </span>
                    )}
                    <span className="text-sm font-medium">{character.name}</span>
                  </button>
                ))}
              </div>

              {selectedCharacter && (
                <article className="overflow-hidden rounded-[32px] border border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fffdf7_100%)] shadow-[0_18px_60px_-46px_rgba(15,23,42,0.5)]">
                  <div className="max-h-[44rem] overflow-y-auto">
                    <div className="border-b border-border/60 px-6 py-6">
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex items-start gap-4">
                          {selectedCharacter.avatarUrl ? (
                            <img src={selectedCharacter.avatarUrl} alt="" className="h-20 w-20 rounded-[24px] bg-muted object-cover shadow-sm" />
                          ) : (
                            <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-neutral-100 text-lg font-semibold shadow-sm">
                              {selectedCharacter.name?.[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-[24px] font-semibold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
                                {selectedCharacter.name}
                              </h3>
                              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/85">
                                {selectedCharacter.status}
                              </span>
                            </div>
                            <p className="mt-2 max-w-3xl text-[14px] leading-7 text-muted-foreground">{selectedCharacter.bio}</p>
                            <p className="mt-3 max-w-4xl text-[14px] leading-7 text-slate-800/82">{selectedCharacter.headline}</p>
                          </div>
                        </div>

                        <Link
                          href={`/creator/character/${selectedCharacter.id}`}
                          className="inline-flex h-11 items-center gap-2 rounded-full border border-border/60 bg-white px-4 text-sm text-foreground/75 shadow-sm transition-colors hover:bg-neutral-50"
                        >
                          Character details
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {selectedCharacter.keywords.length > 0 ? (
                          selectedCharacter.keywords.map((keyword) => (
                            <button
                              key={keyword}
                              type="button"
                              onClick={() =>
                                setActiveSignal((current) =>
                                  current?.value === keyword && current.type === "topic" ? null : { type: "topic", value: keyword }
                                )
                              }
                              className={cn(
                                "rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors",
                                activeSignal?.value === keyword
                                  ? "bg-amber-500 text-white"
                                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                              )}
                            >
                              {keyword}
                            </button>
                          ))
                        ) : (
                          <span className="text-[12px] text-muted-foreground">Waiting for more conversations before stronger keyword signals appear.</span>
                        )}
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
                        <MiniMetric label="Conversations" value={formatNumber(selectedCharacter.conversationCount)} />
                        <MiniMetric label="Messages" value={formatNumber(selectedCharacter.messageCount)} />
                        <MiniMetric label="Last active" value={formatRelativeTime(selectedCharacter.lastActiveAt)} />
                        <MiniMetric label="Visible chats" value={formatNumber(selectedCharacterConversations.length)} />
                      </div>
                    </div>

                    <div className="grid gap-4 px-6 py-6 xl:grid-cols-[0.95fr_0.95fr_1.1fr]">
                      <CharacterList title="Recent Questions" items={selectedCharacter.recentQuestions} empty="No recent user questions yet." />
                      <CharacterList title="Best Answer Beats" items={selectedCharacter.interestingMoments} empty="No standout answer moments yet." />
                      <CharacterSources title="Most Referenced Sources" items={selectedCharacter.topSources} />
                    </div>

                    <div className="border-t border-border/60 bg-neutral-50/70 px-6 py-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/75">Recent Chat History</p>
                          <p className="mt-1 text-[12px] text-muted-foreground">Open any saved conversation for the full turn-by-turn transcript.</p>
                        </div>
                        <div className="rounded-full border border-border/60 bg-white px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
                          {selectedCharacterConversations.length} visible
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 xl:grid-cols-2">
                        {selectedCharacterConversations.length > 0 ? (
                          selectedCharacterConversations.map((conversation) => (
                            <button
                              key={conversation.id}
                              type="button"
                              onClick={() => setSelectedConversation(conversation)}
                              className="group rounded-[22px] border border-border/60 bg-white p-4 text-left shadow-sm transition-colors hover:border-border hover:bg-white"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="truncate text-[14px] font-semibold text-slate-900">{conversation.title}</p>
                                <span className="text-[11px] text-muted-foreground">{formatRelativeTime(conversation.startedAt)}</span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-[12px] leading-6 text-muted-foreground">{conversation.summary}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {conversation.keywords.slice(0, 4).map((keyword) => (
                                  <span key={keyword} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-700">
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                              <div className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-amber-700">
                                View chat history
                                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-[22px] border border-dashed border-border bg-white/70 px-4 py-6 text-sm text-muted-foreground xl:col-span-2">
                            No saved conversations match the current filter for this character yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )}
            </>
          )}
        </section>
      </div>

      <ConversationDrawer
        conversation={selectedConversation}
        open={!!selectedConversation}
        onOpenChange={(open) => {
          if (!open) setSelectedConversation(null);
        }}
      />
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={cn("rounded-[24px] border border-border/60 bg-gradient-to-br p-5 shadow-sm", tone)}>
      <Icon className="mb-4 h-5 w-5 text-slate-500" />
      <p className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-border/60 bg-white/75 px-3 py-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CharacterList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-[22px] border border-border/60 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/75">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <p key={index} className="rounded-2xl bg-neutral-50 px-3 py-2 text-[12px] leading-relaxed text-slate-800/85">
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
    <div className="rounded-[22px] border border-border/60 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/75">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <div key={index} className="rounded-2xl bg-neutral-50 px-3 py-2">
              <p className="line-clamp-2 text-[12px] font-medium leading-relaxed text-slate-900/85">{item.title}</p>
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

function ConversationDrawer({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: ConversationPreview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-hidden border-l border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fffdf7_100%)] shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)] focus:outline-none">
          {conversation ? (
            <>
              <div className="border-b border-border/60 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                      <Sparkles className="h-3.5 w-3.5" />
                      Chat History
                    </div>
                    <Dialog.Title className="mt-3 text-xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
                      {conversation.title}
                    </Dialog.Title>
                    <Dialog.Description className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                      {conversation.summary}
                    </Dialog.Description>
                  </div>

                  <Dialog.Close className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-white text-slate-500 shadow-sm transition-colors hover:bg-neutral-50">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatDateTime(conversation.startedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {conversation.messageCount} messages
                  </span>
                  <Link
                    href={`/creator/character/${conversation.characterId}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-white transition-colors hover:bg-neutral-800"
                  >
                    Character details
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {conversation.keywords.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {conversation.keywords.map((keyword) => (
                      <span key={keyword} className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-amber-700">
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-b border-border/60 bg-neutral-50/80 px-6 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">Referenced Sources</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {conversation.topSources.length > 0 ? (
                    conversation.topSources.map((source) =>
                      source.url ? (
                        <a
                          key={`${source.title}-${source.url}`}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-700 shadow-sm transition-colors hover:bg-neutral-100"
                        >
                          {source.title}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span key={source.title} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-700 shadow-sm">
                          {source.title}
                        </span>
                      )
                    )
                  ) : (
                    <p className="text-[12px] text-muted-foreground">No source cards were attached to this saved chat.</p>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-4">
                  {conversation.messages.map((message) => {
                    const articles = Array.isArray(message.sourcesJson?.articles) ? message.sourcesJson.articles : [];
                    const isUser = message.role === "USER";

                    return (
                      <div key={message.id} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
                        <div
                          className={cn(
                            "mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-[11px] font-semibold",
                            isUser ? "bg-amber-500 text-white" : "bg-slate-900 text-white/88"
                          )}
                        >
                          {isUser ? "You" : conversation.characterName?.[0]}
                        </div>
                        <div className={cn("max-w-[85%]", isUser && "text-right")}>
                          <p className="mb-1 text-[11px] text-muted-foreground">
                            {isUser ? "User" : conversation.characterName} · {formatDateTime(message.createdAt)}
                          </p>
                          <div
                            className={cn(
                              "rounded-[22px] px-4 py-3 text-[13px] leading-7 shadow-sm",
                              isUser ? "bg-amber-50 text-slate-900" : "bg-white text-slate-800"
                            )}
                          >
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>

                          {articles.length > 0 && (
                            <div className={cn("mt-2 flex flex-wrap gap-2", isUser && "justify-end")}>
                              {articles.slice(0, 3).map((article: any) =>
                                article.url ? (
                                  <a
                                    key={article.sourceId || article.url}
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] text-white/88"
                                  >
                                    {article.title}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span
                                    key={article.sourceId || article.title}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] text-white/88"
                                  >
                                    {article.title}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
