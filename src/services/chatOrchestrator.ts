// ──────────────────────────────────────────────────────────────
// Chat Orchestration Layer — Coordinates RAG, LLM, Voice, Citations
// ──────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { searchSimilar } from "./embeddings";
import { buildSystemPrompt, streamCompletion } from "./llm";
import { generateSpeech } from "./voiceService";
import { getLinkedSourceIds } from "./character";
import type { SourceCitation, ArticleReference } from "@/types";

// ── Types ────────────────────────────────────────────────────

export interface ChatContext {
  characterId: string;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  voiceEnabled: boolean;
  sessionId: string;
  conversationId?: string;
}

export interface ChatEvent {
  type: "text" | "sources" | "articles" | "audio" | "audio_error" | "video" | "done" | "error";
  data: any;
}

// ── Scoped Vector Search ─────────────────────────────────────

/**
 * Search for similar content, scoped to character's linked knowledge sources.
 * If no sources are linked, searches all user sources.
 */
async function searchCharacterKnowledge(
  query: string,
  userId: string,
  characterId: string,
  topK = 6,
  minScore = 0.25
) {
  const linkedSourceIds = await getLinkedSourceIds(characterId);

  if (linkedSourceIds.length > 0) {
    // Scoped search: only search within linked sources
    console.log(`[Chat] Scoped search: ${linkedSourceIds.length} linked sources for character ${characterId}`);
    return scopedSearch(query, linkedSourceIds, topK, minScore);
  }

  // Fallback: search all user sources
  return searchSimilar(query, userId, topK, minScore);
}

async function scopedSearch(
  query: string,
  sourceIds: string[],
  topK: number,
  minScore: number
) {
  const { embedText } = await import("./embeddings");
  const queryVec = await embedText(query);
  const vecStr = `[${queryVec.join(",")}]`;

  // Build parameterized query for source IDs
  const placeholders = sourceIds.map((_, i) => `$${i + 3}`).join(", ");

  const results = await db.$queryRawUnsafe<any[]>(
    `SELECT c.id as "chunkId", c.content, c.heading, s.id as "sourceId", s.title as "sourceTitle",
     s."sourceUrl", s."publishDate", s.topic,
     1 - (c.embedding <=> $1::vector) as score
     FROM "ContentChunk" c JOIN "KnowledgeSource" s ON c."sourceId" = s.id
     WHERE s.id IN (${placeholders}) AND s.status = 'INDEXED' AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector LIMIT $2`,
    vecStr,
    topK,
    ...sourceIds
  );

  return results.filter((r) => Number(r.score) >= minScore);
}

// ── Citation Builder ─────────────────────────────────────────

/**
 * Build article reference blocks from raw search results.
 * Groups chunks by source and creates citation cards.
 */
function buildArticleReferences(chunks: any[]): ArticleReference[] {
  const sourceMap = new Map<string, ArticleReference>();

  for (const chunk of chunks) {
    const existing = sourceMap.get(chunk.sourceId);
    if (existing) {
      existing.chunks.push({
        chunkId: chunk.chunkId,
        heading: chunk.heading,
        score: Number(chunk.score),
      });
      // Update excerpt if this chunk has a higher score
      if (Number(chunk.score) > (existing.chunks[0]?.score || 0)) {
        existing.excerpt = chunk.content.slice(0, 150) + "…";
      }
    } else {
      sourceMap.set(chunk.sourceId, {
        sourceId: chunk.sourceId,
        title: chunk.sourceTitle,
        url: chunk.sourceUrl || null,
        excerpt: chunk.content.slice(0, 150) + "…",
        publishDate: chunk.publishDate || null,
        topic: chunk.topic || null,
        chunks: [
          {
            chunkId: chunk.chunkId,
            heading: chunk.heading,
            score: Number(chunk.score),
          },
        ],
      });
    }
  }

  return Array.from(sourceMap.values()).sort(
    (a, b) => Math.max(...b.chunks.map((c) => c.score)) - Math.max(...a.chunks.map((c) => c.score))
  );
}

/**
 * Build flat source citations (for backwards compatibility).
 */
function buildSourceCitations(chunks: any[]): SourceCitation[] {
  const seen = new Set<string>();
  return chunks
    .filter((c) => {
      if (seen.has(c.sourceId)) return false;
      seen.add(c.sourceId);
      return true;
    })
    .map((c) => ({
      sourceId: c.sourceId,
      sourceTitle: c.sourceTitle,
      sourceUrl: c.sourceUrl || null,
      score: Number(c.score),
      excerpt: c.content.slice(0, 150) + "…",
      chunkId: c.chunkId,
      heading: c.heading,
    }));
}

// ── Main Chat Orchestrator ───────────────────────────────────

/**
 * Orchestrate a complete chat turn: RAG → LLM → Voice → Citations.
 * Yields events as an async generator for SSE streaming.
 */
export async function* orchestrateChat(
  ctx: ChatContext
): AsyncGenerator<ChatEvent> {
  // 1. Load character with voice
  const character = await db.character.findUnique({
    where: { id: ctx.characterId },
    include: { voice: true },
  });

  if (!character || character.status !== "PUBLISHED") {
    yield { type: "error", data: { error: "Character not found or not published" } };
    return;
  }

  // 2. Create or find conversation
  let conversation: any = null;
  try {
    conversation = ctx.conversationId
      ? await db.conversation.findUnique({ where: { id: ctx.conversationId } })
      : null;
    if (!conversation) {
      conversation = await db.conversation.create({
        data: { characterId: ctx.characterId, sessionId: ctx.sessionId },
      });
    }
    await db.message.create({
      data: { conversationId: conversation.id, role: "USER", content: ctx.message },
    });
  } catch (e) {
    console.error("[Chat] DB write failed:", e);
  }

  // 3. Vector search scoped to character's knowledge
  let chunks: any[] = [];
  try {
    chunks = await searchCharacterKnowledge(
      ctx.message,
      character.userId,
      ctx.characterId,
      6,
      0.25
    );
  } catch (e) {
    console.error("[Chat] Vector search failed:", e);
  }

  // 4. Build citations and article references
  const sourceCitations = buildSourceCitations(chunks);
  const articleReferences = buildArticleReferences(chunks);

  // 5. Build system prompt and messages
  const sourcesForPrompt = chunks.map((c: any) => ({
    title: c.sourceTitle,
    content: c.content,
  }));

  const systemPrompt = buildSystemPrompt(
    character.name,
    character.bio,
    character.personalityTone,
    sourcesForPrompt
  );

  const messages = [
    ...ctx.history.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: ctx.message },
  ];

  // 6. Stream text from LLM
  let fullText = "";
  try {
    for await (const chunk of streamCompletion(systemPrompt, messages)) {
      fullText += chunk;
      yield { type: "text", data: { chunk } };
    }
  } catch (err: any) {
    yield { type: "error", data: { error: `LLM streaming failed: ${err.message}` } };
    return;
  }

  // 7. Send sources and article references
  yield { type: "sources", data: sourceCitations };
  yield { type: "articles", data: articleReferences };

  // 8. Save assistant message
  try {
    if (conversation) {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: fullText,
          sourcesJson: { citations: sourceCitations, articles: articleReferences } as any,
          audioGenerated: ctx.voiceEnabled,
        },
      });
    }
  } catch (e) {
    console.error("[Chat] DB save failed:", e);
  }

  // 9. Generate voice audio
  if (ctx.voiceEnabled && character.voice?.elevenLabsVoiceId && fullText.length > 0) {
    try {
      const audioBuf = await generateSpeech(fullText, character.voice.elevenLabsVoiceId);
      const audioBase64 = Buffer.from(audioBuf).toString("base64");
      yield { type: "audio", data: { audioBase64, format: "mp3" } };
    } catch (err: any) {
      console.error("[Chat] Voice synthesis failed:", err);
      yield { type: "audio_error", data: { error: err?.message || "Voice synthesis failed" } };
    }
  }

  // 10. Send video URLs if available
  if (character.speakingVideoUrl || character.idleVideoUrl) {
    yield {
      type: "video",
      data: {
        speakingVideoUrl: character.speakingVideoUrl,
        idleVideoUrl: character.idleVideoUrl,
      },
    };
  }

  // 11. Done
  yield { type: "done", data: { conversationId: conversation?.id } };
}
