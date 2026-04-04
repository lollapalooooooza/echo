import OpenAI from "openai";
import { env } from "@/lib/env";
import { db } from "@/lib/db";

let _client: OpenAI | null = null;
function openai(): OpenAI { if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY }); return _client; }
const EMBEDDING_WRITE_BATCH_SIZE = 8;
const EMBEDDING_WRITE_RETRY_LIMIT = 4;
const EMBEDDING_WRITE_RETRY_DELAY_MS = 300;

function isRetryableEmbeddingWriteError(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as any).message || "")
        : "";

  return (
    /Transaction API error: Transaction not found/i.test(message) ||
    /Timed out fetching a new connection from the connection pool/i.test(message) ||
    /Timed out fetching/i.test(message) ||
    /Can't reach database server/i.test(message)
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withEmbeddingWriteRetry<T>(task: () => Promise<T>) {
  let attempt = 0;

  while (true) {
    try {
      return await task();
    } catch (error) {
      attempt += 1;
      if (!isRetryableEmbeddingWriteError(error) || attempt >= EMBEDDING_WRITE_RETRY_LIMIT) {
        throw error;
      }
      await wait(EMBEDDING_WRITE_RETRY_DELAY_MS * attempt);
    }
  }
}

function buildEmbeddingUpdateBatchQuery(batchSize: number) {
  const valueTuples = Array.from({ length: batchSize }, (_, index) => {
    const idParam = index * 2 + 1;
    const embeddingParam = index * 2 + 2;
    return `($${idParam}, $${embeddingParam})`;
  }).join(", ");

  return `
    UPDATE "ContentChunk" AS chunk
    SET embedding = payload.embedding::vector
    FROM (VALUES ${valueTuples}) AS payload(id, embedding)
    WHERE chunk.id = payload.id
  `;
}

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

  for (let index = 0; index < chunks.length; index += EMBEDDING_WRITE_BATCH_SIZE) {
    const batch = chunks.slice(index, index + EMBEDDING_WRITE_BATCH_SIZE);
    const batchEmbeddings = embeddings.slice(index, index + EMBEDDING_WRITE_BATCH_SIZE);
    const query = buildEmbeddingUpdateBatchQuery(batch.length);
    const params = batch.flatMap((chunk, batchIndex) => [
      chunk.id,
      `[${batchEmbeddings[batchIndex].join(",")}]`,
    ]);

    await withEmbeddingWriteRetry(() => db.$executeRawUnsafe(query, ...params));
  }

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
