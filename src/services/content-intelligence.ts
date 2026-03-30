import OpenAI from "openai";

import { env } from "@/lib/env";

const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini";

let _client: OpenAI | null = null;

function openai() {
  if (!_client) {
    _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  return _client;
}

function cleanText(value: string, maxLength = 280) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function firstSentences(text: string, count = 2) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, count)
    .join(" ");
}

function heuristicTopic(text: string, title: string) {
  const combined = `${title} ${text.slice(0, 1800)}`.toLowerCase();
  const topics: Array<[string, RegExp]> = [
    ["Technology", /\b(ai|machine learning|software|programming|api|cloud|data|engineering)\b/g],
    ["Business", /\b(startup|market|growth|sales|strategy|enterprise|revenue)\b/g],
    ["Design", /\b(design|ux|ui|interface|typography|visual|layout)\b/g],
    ["Education", /\b(learning|teaching|course|student|training|lesson)\b/g],
    ["Marketing", /\b(marketing|seo|brand|campaign|audience|content)\b/g],
    ["Product", /\b(product|roadmap|feature|launch|user feedback|iteration)\b/g],
    ["Health", /\b(health|medical|treatment|patient|wellness|clinical)\b/g],
  ];

  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const [topic, pattern] of topics) {
    const matches = combined.match(pattern);
    const score = matches?.length || 0;
    if (score > bestScore) {
      bestTopic = topic;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestTopic : null;
}

function extractJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return fallback;

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return fallback;
    }
  }
}

export async function summarizeKnowledgeSource(input: {
  title: string;
  text: string;
  sourceUrl?: string | null;
  type: string;
}) {
  const fallbackSummary =
    cleanText(firstSentences(input.text, 2), 220) ||
    cleanText(input.text, 220) ||
    "Concise summary unavailable.";

  const fallback = {
    title: cleanText(input.title || input.sourceUrl || "Untitled source", 120),
    summary: fallbackSummary,
    topic: heuristicTopic(input.text, input.title),
  };

  if (!env.OPENAI_API_KEY) {
    return fallback;
  }

  try {
    const response = await openai().chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You turn imported knowledge into crisp library metadata. Return strict JSON with keys title, summary, and topic. " +
            "Rules: summary must be specific, human-readable, max 2 sentences, no markdown, no bullet points, and no quoting raw garbage. " +
            "Prefer the article or document title if it is already good. Topic should be a short category or null.",
        },
        {
          role: "user",
          content: JSON.stringify({
            type: input.type,
            sourceUrl: input.sourceUrl || null,
            title: input.title,
            textExcerpt: input.text.slice(0, 10000),
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "";
    const parsed = extractJson<{ title?: string; summary?: string; topic?: string | null }>(content, {});

    return {
      title: cleanText(parsed.title || fallback.title, 120),
      summary: cleanText(parsed.summary || fallback.summary, 220),
      topic: parsed.topic ? cleanText(parsed.topic, 40) : fallback.topic,
    };
  } catch (error) {
    console.warn("[ContentIntelligence] Knowledge summary fallback:", error);
    return fallback;
  }
}

type CharacterAnalyticsInput = {
  name: string;
  recentQuestions: string[];
  interestingMoments: string[];
  topSources: Array<{ title: string; count: number }>;
};

function fallbackAnalyticsDigest(characters: CharacterAnalyticsInput[]) {
  const recentQuestions = characters.flatMap((character) => character.recentQuestions).slice(0, 6);
  const topTopics = Array.from(
    new Set(
      characters
        .flatMap((character) => character.topSources.map((source) => source.title))
        .filter(Boolean)
    )
  ).slice(0, 5);
  const interestingMoments = characters.flatMap((character) => character.interestingMoments).slice(0, 4);

  return {
    overview:
      recentQuestions.length > 0
        ? `Recent conversations are centering on ${recentQuestions[0].toLowerCase()} and nearby follow-up questions.`
        : "Recent conversations are starting to accumulate, but there is not enough material for a deeper pattern read yet.",
    topTopics,
    commonQuestions: recentQuestions,
    interestingMoments,
  };
}

export async function summarizeAnalyticsDigest(characters: CharacterAnalyticsInput[]) {
  const fallback = fallbackAnalyticsDigest(characters);

  if (!env.OPENAI_API_KEY || characters.length === 0) {
    return fallback;
  }

  try {
    const response = await openai().chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are summarizing creator analytics for AI characters. Return strict JSON with keys overview, topTopics, commonQuestions, interestingMoments. " +
            "Keep overview under 2 sentences. Each array should contain short, specific strings only. Base everything only on the provided recent conversation evidence.",
        },
        {
          role: "user",
          content: JSON.stringify({ characters }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "";
    const parsed = extractJson<{
      overview?: string;
      topTopics?: string[];
      commonQuestions?: string[];
      interestingMoments?: string[];
    }>(content, {});

    return {
      overview: cleanText(parsed.overview || fallback.overview, 220),
      topTopics: (parsed.topTopics || fallback.topTopics).map((item) => cleanText(item, 60)).slice(0, 5),
      commonQuestions: (parsed.commonQuestions || fallback.commonQuestions).map((item) => cleanText(item, 100)).slice(0, 5),
      interestingMoments: (parsed.interestingMoments || fallback.interestingMoments).map((item) => cleanText(item, 120)).slice(0, 4),
    };
  } catch (error) {
    console.warn("[ContentIntelligence] Analytics summary fallback:", error);
    return fallback;
  }
}
