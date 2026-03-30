import OpenAI from "openai";
import { env } from "@/lib/env";
import { db } from "@/lib/db";

let _client: OpenAI | null = null;
function openai(): OpenAI { if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY }); return _client; }

export async function embedText(text: string): Promise<number[]> {
  const res = await openai().embeddings.create({ model: env.OPENAI_EMBEDDING_MODEL, input: text.slice(0, 8000) });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += 2048) {
    const batch = texts.slice(i, i + 2048).map((t) => t.slice(0, 8000));
    const res = await openai().embeddings.create({ model: env.OPENAI_EMBEDDING_MODEL, input: batch });
    for (const item of res.data) results.push(item.embedding);
  }
  return results;
}

export async function storeEmbeddings(chunks: { id: string; content: string }[]): Promise<void> {
  if (chunks.length === 0) return;
  console.log(`[Embed] Embedding ${chunks.length} chunks…`);
  const embeddings = await embedBatch(chunks.map((c) => c.content));
  await Promise.all(
    chunks.map((chunk, index) => {
      const vecStr = `[${embeddings[index].join(",")}]`;
      return db.$executeRawUnsafe(`UPDATE "ContentChunk" SET embedding = $1::vector WHERE id = $2`, vecStr, chunk.id);
    })
  );
  console.log(`[Embed] ✓ Stored ${chunks.length} embeddings`);
}

export async function searchSimilar(query: string, userId: string, topK = 6, minScore = 0.3) {
  console.log(`[Search] Query: "${query.slice(0, 60)}…" for user ${userId}`);
  const queryVec = await embedText(query);
  const vecStr = `[${queryVec.join(",")}]`;

  const results = await db.$queryRawUnsafe<any[]>(
    `SELECT c.id as "chunkId", c.content, c.heading, s.id as "sourceId", s.title as "sourceTitle", s."sourceUrl",
     1 - (c.embedding <=> $1::vector) as score
     FROM "ContentChunk" c JOIN "KnowledgeSource" s ON c."sourceId" = s.id
     WHERE s."userId" = $2 AND s.status = 'INDEXED' AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector LIMIT $3`,
    vecStr, userId, topK
  );

  const filtered = results.filter((r) => Number(r.score) >= minScore);
  console.log(`[Search] ✓ Found ${filtered.length} relevant chunks (of ${results.length} total)`);
  return filtered;
}

/**
 * Search within specific knowledge sources (for character-scoped RAG).
 */
export async function searchScopedSimilar(
  query: string,
  sourceIds: string[],
  topK = 6,
  minScore = 0.3
) {
  if (sourceIds.length === 0) return [];

  console.log(`[Search] Scoped query: "${query.slice(0, 60)}…" across ${sourceIds.length} sources`);
  const queryVec = await embedText(query);
  const vecStr = `[${queryVec.join(",")}]`;

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

  const filtered = results.filter((r) => Number(r.score) >= minScore);
  console.log(`[Search] ✓ Scoped: ${filtered.length} relevant chunks (of ${results.length} total)`);
  return filtered;
}
