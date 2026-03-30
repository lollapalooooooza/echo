import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { summarizeAnalyticsDigest } from "@/services/content-intelligence";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "being",
  "between",
  "could",
  "does",
  "from",
  "have",
  "into",
  "just",
  "more",
  "only",
  "over",
  "some",
  "than",
  "that",
  "them",
  "they",
  "this",
  "through",
  "very",
  "want",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
  "you're",
  "their",
  "there",
  "because",
  "should",
  "using",
  "used",
  "like",
  "into",
  "will",
  "cant",
  "don't",
  "doesn't",
  "isn't",
  "aren't",
  "how",
  "why",
  "who",
  "tell",
  "show",
  "make",
  "made",
  "need",
  "help",
  "please",
  "theyre",
  "we're",
  "were",
  "it's",
  "its",
  "ours",
  "theirs",
  "then",
  "here",
  "each",
  "such",
  "many",
  "much",
  "asks",
  "asked",
  "asking",
  "said",
  "says",
  "saying",
]);

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

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function extractKeywords(texts: string[], limit = 6) {
  const counts = new Map<string, number>();

  for (const text of texts) {
    const tokens = normalizeText(text)
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));

    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function buildConversationTitle(question: string, characterName: string) {
  const compact = firstSentence(question, 72);
  if (compact) return compact;
  return `Conversation with ${characterName}`;
}

function buildConversationSummary(question: string, answer: string) {
  const trimmedQuestion = firstSentence(question, 110);
  const trimmedAnswer = firstSentence(answer, 140);

  if (trimmedQuestion && trimmedAnswer) {
    return `User asked about ${trimmedQuestion.toLowerCase()} Character reply: ${trimmedAnswer}`;
  }

  if (trimmedQuestion) return `User asked about ${trimmedQuestion.toLowerCase()}.`;
  if (trimmedAnswer) return trimmedAnswer;

  return "A recent conversation is available to inspect in detail.";
}

function buildCharacterHeadline(
  questions: string[],
  interestingMoments: string[],
  keywords: string[],
  topSources: Array<{ title: string }>
) {
  if (questions[0] && interestingMoments[0]) {
    return `Users keep returning to ${questions[0].toLowerCase()}, and the strongest replies often lean on ${interestingMoments[0].toLowerCase()}`;
  }

  if (keywords[0] && keywords[1]) {
    return `Recent activity clusters around ${keywords[0]} and ${keywords[1]}.`;
  }

  if (topSources[0]?.title) {
    return `This character is currently drawing most often from ${topSources[0].title}.`;
  }

  return "Conversation patterns will appear here as soon as this character starts getting more traffic.";
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
          endedAt: true,
          messages: {
            take: 24,
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
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
    const keywords = extractKeywords(
      [
        ...userMessages,
        ...assistantMessages.map((message) => firstSentence(message.content, 160)),
        ...topSources.map((source) => source.title),
      ],
      6
    );
    const recentConversations = character.conversations.map((conversation) => {
      const userTurns = conversation.messages.filter((message) => message.role === "USER");
      const assistantTurns = conversation.messages.filter((message) => message.role === "ASSISTANT");
      const title = buildConversationTitle(userTurns[0]?.content || "", character.name);
      const summary = buildConversationSummary(userTurns[0]?.content || "", assistantTurns[0]?.content || "");
      const conversationSources = extractSourceStats(assistantTurns).slice(0, 3);
      const conversationKeywords = extractKeywords(
        [
          ...userTurns.map((message) => message.content),
          ...assistantTurns.map((message) => firstSentence(message.content, 180)),
          ...conversationSources.map((source) => source.title),
        ],
        5
      );

      return {
        id: conversation.id,
        characterId: character.id,
        characterName: character.name,
        characterSlug: character.slug,
        characterAvatarUrl: character.avatarUrl,
        startedAt: conversation.startedAt,
        endedAt: conversation.endedAt,
        title,
        summary,
        keywords: conversationKeywords,
        sourceCount: conversationSources.length,
        topSources: conversationSources,
        messageCount: conversation.messages.length,
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          sourcesJson: message.sourcesJson,
        })),
      };
    });

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
      headline: buildCharacterHeadline(recentQuestions, interestingMoments, keywords, topSources),
      keywords,
      recentQuestions,
      interestingMoments,
      topSources: topSources.slice(0, 4),
      lastActiveAt: character.conversations[0]?.startedAt || character.updatedAt,
      recentConversations,
    };
  });

  const recentConversations = enrichedCharacters
    .flatMap((character) => character.recentConversations)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 8);

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
    recentConversations,
  });
}
