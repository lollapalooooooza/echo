import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { summarizeAnalyticsDigest } from "@/services/content-intelligence";

function uniqueRecent(items: string[], limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function firstSentence(text: string, maxLength = 140) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const sentence = compact.split(/(?<=[.!?])\s+/)[0] || compact;
  if (sentence.length <= maxLength) return sentence;
  return `${sentence.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractSourceStats(messages: Array<{ sourcesJson?: any }>) {
  const sourceMap = new Map<string, { title: string; url?: string | null; count: number }>();

  for (const message of messages) {
    const articles = Array.isArray(message.sourcesJson?.articles) ? message.sourcesJson.articles : [];
    for (const article of articles) {
      const key = String(article.sourceId || article.url || article.title || Math.random());
      const existing = sourceMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        sourceMap.set(key, {
          title: String(article.title || "Untitled article"),
          url: typeof article.url === "string" ? article.url : null,
          count: 1,
        });
      }
    }
  }

  return Array.from(sourceMap.values()).sort((a, b) => b.count - a.count);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const characters = await db.character.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      avatarUrl: true,
      status: true,
      bio: true,
      updatedAt: true,
      _count: { select: { conversations: true } },
      conversations: {
        take: 8,
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          startedAt: true,
          messages: {
            take: 18,
            orderBy: { createdAt: "asc" },
            select: {
              role: true,
              content: true,
              sourcesJson: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const totalConversations = characters.reduce((sum, character) => sum + (character._count?.conversations || 0), 0);
  const totalMessages = characters.reduce(
    (sum, character) => sum + character.conversations.reduce((conversationSum, conversation) => conversationSum + conversation.messages.length, 0),
    0
  );

  const enrichedCharacters = characters.map((character) => {
    const allMessages = character.conversations.flatMap((conversation) => conversation.messages);
    const userMessages = allMessages
      .filter((message) => message.role === "USER")
      .map((message) => message.content)
      .reverse();
    const assistantMessages = allMessages.filter((message) => message.role === "ASSISTANT");
    const topSources = extractSourceStats(assistantMessages);
    const recentQuestions = uniqueRecent(userMessages, 4);
    const interestingMoments = uniqueRecent(
      assistantMessages
        .filter((message) => message.content.trim().length > 40)
        .map((message) => firstSentence(message.content))
        .reverse(),
      3
    );

    return {
      id: character.id,
      name: character.name,
      slug: character.slug,
      avatarUrl: character.avatarUrl,
      bio: character.bio,
      status: character.status,
      updatedAt: character.updatedAt,
      conversationCount: character._count?.conversations || 0,
      messageCount: allMessages.length,
      recentQuestions,
      interestingMoments,
      topSources: topSources.slice(0, 4),
      lastActiveAt: character.conversations[0]?.startedAt || character.updatedAt,
    };
  });

  const digest = await summarizeAnalyticsDigest(
    enrichedCharacters
      .filter((character) => character.conversationCount > 0)
      .slice(0, 6)
      .map((character) => ({
        name: character.name,
        recentQuestions: character.recentQuestions,
        interestingMoments: character.interestingMoments,
        topSources: character.topSources.map((source) => ({ title: source.title, count: source.count })),
      }))
  );

  return NextResponse.json({
    totals: {
      totalConversations,
      totalMessages,
      characterCount: characters.length,
      publishedCount: characters.filter((character) => character.status === "PUBLISHED").length,
    },
    digest,
    characters: enrichedCharacters,
  });
}
