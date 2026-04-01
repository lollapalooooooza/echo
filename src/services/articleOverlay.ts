import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { searchScopedSimilar, searchSimilar } from "@/services/embeddings";
import { getLinkedSourceIds } from "@/services/character";
import type { ArticleReference } from "@/types";

const ARTICLE_REQUEST_PATTERN =
  /\b(article|post|blog|source|link|read|reading|essay|newsletter|write[- ]?up|piece|interview|show me|open|send me|where can i read|which article|which post|original)\b|文章|原文|链接|出处/i;

const MAX_CANDIDATES = 5;

let anthropicClient: Anthropic | null = null;

function anthropic() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

type ArticleCandidate = ArticleReference & {
  bestScore: number;
};

export type ArticleOverlayResult =
  | {
      shouldShow: false;
    }
  | {
      shouldShow: true;
      article: {
        sourceId: string;
        title: string;
        url: string;
        excerpt: string;
        topic?: string | null;
        publishDate?: string | null;
        reason: string;
        ctaLabel: string;
      };
    };

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function clampText(value: string | null | undefined, maxLength: number) {
  const normalized = compactText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildArticleReferences(chunks: any[]) {
  const sourceMap = new Map<string, ArticleCandidate>();

  for (const chunk of chunks) {
    const chunkScore = Number(chunk.score) || 0;
    const excerpt = clampText(chunk.content, 180);
    const existing = sourceMap.get(chunk.sourceId);

    if (existing) {
      existing.chunks.push({
        chunkId: chunk.chunkId,
        heading: chunk.heading,
        score: chunkScore,
      });

      if (chunkScore >= existing.bestScore && excerpt) {
        existing.excerpt = excerpt;
        existing.bestScore = chunkScore;
      }

      continue;
    }

    sourceMap.set(chunk.sourceId, {
      sourceId: chunk.sourceId,
      title: chunk.sourceTitle,
      url: chunk.sourceUrl || null,
      excerpt,
      publishDate: chunk.publishDate || null,
      topic: chunk.topic || null,
      bestScore: chunkScore,
      chunks: [
        {
          chunkId: chunk.chunkId,
          heading: chunk.heading,
          score: chunkScore,
        },
      ],
    });
  }

  return Array.from(sourceMap.values())
    .filter((article) => !!article.url)
    .sort((left, right) => right.bestScore - left.bestScore)
    .slice(0, MAX_CANDIDATES);
}

function buildCandidateList(candidates: ArticleCandidate[]) {
  return candidates
    .map(
      (candidate, index) =>
        [
          `Candidate ${index + 1}`,
          `sourceId: ${candidate.sourceId}`,
          `title: ${candidate.title}`,
          `url: ${candidate.url}`,
          candidate.topic ? `topic: ${candidate.topic}` : null,
          `relevance: ${candidate.bestScore.toFixed(3)}`,
          `excerpt: ${clampText(candidate.excerpt, 220)}`,
        ]
          .filter(Boolean)
          .join("\n")
    )
    .join("\n\n---\n\n");
}

function heuristicArticleOverlay(utterance: string, candidates: ArticleCandidate[]): ArticleOverlayResult {
  if (!ARTICLE_REQUEST_PATTERN.test(utterance) || candidates.length === 0) {
    return { shouldShow: false };
  }

  const chosen = candidates[0];
  if (!chosen?.url) return { shouldShow: false };

  return {
    shouldShow: true,
    article: {
      sourceId: chosen.sourceId,
      title: chosen.title,
      url: chosen.url,
      excerpt: chosen.excerpt,
      topic: chosen.topic,
      publishDate: chosen.publishDate,
      reason: "This looks like the closest article behind what the visitor asked to read next.",
      ctaLabel: "Open article",
    },
  };
}

export async function selectArticleOverlay(characterId: string, utterance: string): Promise<ArticleOverlayResult> {
  const normalizedUtterance = compactText(utterance);
  if (normalizedUtterance.length < 12 || !ARTICLE_REQUEST_PATTERN.test(normalizedUtterance)) {
    return { shouldShow: false };
  }

  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { id: true, userId: true },
  });

  if (!character) {
    throw new Error("Character not found");
  }

  const linkedSourceIds = await getLinkedSourceIds(characterId);
  const chunks =
    linkedSourceIds.length > 0
      ? await searchScopedSimilar(normalizedUtterance, linkedSourceIds, 8, 0.18)
      : await searchSimilar(normalizedUtterance, character.userId, 8, 0.18);

  const candidates = buildArticleReferences(chunks);
  if (candidates.length === 0) {
    return { shouldShow: false };
  }

  if (!env.ANTHROPIC_API_KEY) {
    return heuristicArticleOverlay(normalizedUtterance, candidates);
  }

  try {
    const response = await anthropic().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 220,
      system: [
        "You decide whether a live avatar UI should show a floating article link bubble.",
        "Only call the tool when the visitor is clearly asking to open, read, view, inspect, or get the source article behind the current topic.",
        "Do not call the tool for normal Q&A, small talk, or general requests for explanation.",
        "If you call the tool, choose exactly one candidate sourceId from the list you were given and provide a short helpful reason for the bubble.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            `Visitor utterance:\n${normalizedUtterance}`,
            `\nCandidate articles:\n${buildCandidateList(candidates)}`,
          ].join("\n\n"),
        },
      ],
      tools: [
        {
          name: "show_article_overlay",
          description:
            "Reveal a single floating article bubble inside the live avatar video only when the visitor explicitly wants to read or open the specific article, blog post, source link, newsletter, or original write-up behind the current answer. Use this only for deeper-reading intent. Never use it for generic conversation. Always choose one exact sourceId from the provided candidates and include a short UX-friendly reason and CTA label.",
          input_schema: {
            type: "object",
            properties: {
              sourceId: {
                type: "string",
                description: "The exact sourceId from the provided candidate list that should be opened.",
              },
              reason: {
                type: "string",
                description: "A short explanation for why this article is the best next read for the visitor.",
              },
              ctaLabel: {
                type: "string",
                description: "Short button text like Open article, Read the post, or See source.",
              },
            },
            required: ["sourceId", "reason"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: {
        type: "auto",
        disable_parallel_tool_use: true,
      },
    });

    const toolBlock = response.content.find(
      (block): block is { type: "tool_use"; id: string; name: string; input: unknown } =>
        block.type === "tool_use" && block.name === "show_article_overlay"
    );

    if (!toolBlock) {
      return { shouldShow: false };
    }

    const input = (toolBlock.input || {}) as {
      sourceId?: string;
      reason?: string;
      ctaLabel?: string;
    };

    const chosen = candidates.find((candidate) => candidate.sourceId === input.sourceId);
    if (!chosen?.url) {
      return { shouldShow: false };
    }

    return {
      shouldShow: true,
      article: {
        sourceId: chosen.sourceId,
        title: chosen.title,
        url: chosen.url,
        excerpt: chosen.excerpt,
        topic: chosen.topic,
        publishDate: chosen.publishDate,
        reason: clampText(input.reason, 120) || "This is the article most likely to deepen the conversation.",
        ctaLabel: clampText(input.ctaLabel, 28) || "Open article",
      },
    };
  } catch (error) {
    console.warn("[ArticleOverlay] Tool call failed, falling back to heuristic selection:", error);
    return heuristicArticleOverlay(normalizedUtterance, candidates);
  }
}
