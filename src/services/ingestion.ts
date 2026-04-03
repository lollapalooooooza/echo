// ──────────────────────────────────────────────────────────────
// Knowledge Ingestion Pipeline — Enhanced with Scrapling support
// ──────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { discoverPages, scrapeUrl } from "@/services/scraping";
import { summarizeKnowledgeSource } from "@/services/content-intelligence";
import { storeEmbeddings } from "./embeddings";

const MAX_CONCURRENT_CHUNK_STORES = 1;
const WEBSITE_CRAWL_CONCURRENCY = 2;
export const MAX_KNOWLEDGE_SOURCE_CHARS = 200_000;

let activeChunkStores = 0;
const chunkStoreWaiters: Array<() => void> = [];

async function withChunkStoreSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeChunkStores >= MAX_CONCURRENT_CHUNK_STORES) {
    await new Promise<void>((resolve) => {
      chunkStoreWaiters.push(resolve);
    });
  }

  activeChunkStores += 1;

  try {
    return await task();
  } finally {
    activeChunkStores = Math.max(0, activeChunkStores - 1);
    const next = chunkStoreWaiters.shift();
    if (next) next();
  }
}

function ensureKnowledgeWithinCharLimit(text: string, label: string) {
  const characterCount = text.length;
  if (characterCount <= MAX_KNOWLEDGE_SOURCE_CHARS) {
    return;
  }

  throw new Error(
    `${label} is too large to ingest. Knowledge uploads are limited to ${MAX_KNOWLEDGE_SOURCE_CHARS.toLocaleString()} characters after text extraction.`
  );
}

// ── Text Chunking ────────────────────────────────────────────

export function chunkText(text: string, maxChars = 1500, overlap = 200) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 30);
  if (!paragraphs.length) return [{ content: text.trim(), heading: "Content", index: 0 }];

  const chunks: { content: string; heading: string; index: number }[] = [];
  let current = "";
  let idx = 0;

  for (const para of paragraphs) {
    if (current.length + para.length > maxChars && current.length > 0) {
      chunks.push({
        content: current.trim(),
        heading: current.split("\n")[0].slice(0, 80),
        index: idx++,
      });
      const words = current.split(/\s+/);
      current = words.slice(-Math.ceil(overlap / 5)).join(" ") + "\n\n";
    }
    current += para + "\n\n";
  }

  if (current.trim().length > 30) {
    chunks.push({
      content: current.trim(),
      heading: current.split("\n")[0].slice(0, 80),
      index: idx,
    });
  }

  return chunks;
}

// ── Topic Detection (simple keyword-based) ───────────────────

function detectTopic(text: string, title: string): string | null {
  const combined = `${title} ${text.slice(0, 2000)}`.toLowerCase();
  const topicPatterns: [string, RegExp[]][] = [
    ["Technology", [/\b(ai|machine learning|software|programming|api|algorithm|cloud|data)\b/]],
    ["Business", [/\b(startup|revenue|market|investment|strategy|growth|enterprise)\b/]],
    ["Science", [/\b(research|study|experiment|hypothesis|peer.?review|journal)\b/]],
    ["Health", [/\b(health|medical|treatment|diagnosis|patient|clinical|wellness)\b/]],
    ["Design", [/\b(design|ux|ui|typography|layout|visual|interface|figma)\b/]],
    ["Marketing", [/\b(marketing|seo|content|brand|audience|campaign|funnel)\b/]],
    ["Finance", [/\b(finance|stock|crypto|investing|portfolio|trading|banking)\b/]],
    ["Education", [/\b(learning|teaching|course|student|curriculum|training)\b/]],
  ];

  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const [topic, patterns] of topicPatterns) {
    let score = 0;
    for (const pattern of patterns) {
      const matches = combined.match(new RegExp(pattern.source, "gi"));
      if (matches) score += matches.length;
    }
    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  return bestTopic;
}

// ── Core Ingestion Functions ─────────────────────────────────

async function processAndStoreChunks(
  sourceId: string,
  text: string
): Promise<number> {
  return withChunkStoreSlot(async () => {
    const textChunks = chunkText(text);
    const records = await db.contentChunk.createManyAndReturn({
      data: textChunks.map((tc) => ({
        sourceId,
        chunkIndex: tc.index,
        content: tc.content,
        heading: tc.heading,
        tokenCount: Math.ceil(tc.content.length / 4),
      })),
      select: {
        id: true,
        content: true,
      },
    });
    await storeEmbeddings(records.map((c) => ({ id: c.id, content: c.content })));
    return records.length;
  });
}

function stripWww(hostname: string) {
  return hostname.replace(/^www\./i, "");
}

function normalizeCrawlUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";

  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

function isSameCrawlDomain(candidate: string, baseUrl: string) {
  try {
    return stripWww(new URL(candidate).hostname.toLowerCase()) === stripWww(new URL(baseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export type WebsiteCrawlProgressEvent =
  | {
      type: "discovered";
      baseUrl: string;
      totalDiscovered: number;
      queued: number;
      skippedExisting: number;
      remaining: number;
      limit: number;
    }
  | {
      type: "page";
      phase: "reading" | "indexed" | "error";
      url: string;
      title?: string;
      processed: number;
      total: number;
      indexed: number;
      errors: number;
      remaining: number;
      error?: string;
    }
  | {
      type: "done";
      baseUrl: string;
      totalDiscovered: number;
      queued: number;
      skippedExisting: number;
      remaining: number;
      processed: number;
      indexed: number;
      errors: number;
    };

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private resolvers: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: Error) => void;
  }> = [];
  private closed = false;
  private error: Error | null = null;

  push(item: T) {
    if (this.closed || this.error) return;

    const pending = this.resolvers.shift();
    if (pending) {
      pending.resolve({ value: item, done: false });
      return;
    }

    this.items.push(item);
  }

  fail(error: Error) {
    this.error = error;
    while (this.resolvers.length > 0) {
      this.resolvers.shift()?.reject(error);
    }
  }

  close() {
    this.closed = true;
    while (this.resolvers.length > 0) {
      this.resolvers.shift()?.resolve({ value: undefined as T, done: true });
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length > 0) {
          return Promise.resolve({ value: this.items.shift()!, done: false });
        }

        if (this.error) {
          return Promise.reject(this.error);
        }

        if (this.closed) {
          return Promise.resolve({ value: undefined as T, done: true });
        }

        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.resolvers.push({ resolve, reject });
        });
      },
    };
  }
}

export async function ingestUrl(url: string, userId: string): Promise<string> {
  console.log(`[Ingest] Starting URL: ${url}`);
  const source = await db.knowledgeSource.create({
    data: { userId, type: "URL", title: url, sourceUrl: url, status: "CRAWLING" },
  });

  try {
    const scrapeResult = await scrapeUrl(url, { mode: "stealth" });
    ensureKnowledgeWithinCharLimit(scrapeResult.content, `The page at ${url}`);
    console.log(`[Ingest] Scraped: "${scrapeResult.title}" (${scrapeResult.wordCount} words, via ${scrapeResult.fetchMethod})`);

    const summaryMeta = await summarizeKnowledgeSource({
      title: scrapeResult.title,
      text: scrapeResult.content,
      sourceUrl: url,
      type: "URL",
    });
    const topic = summaryMeta.topic || detectTopic(scrapeResult.content, scrapeResult.title);

    await db.knowledgeSource.update({
      where: { id: source.id },
      data: {
        title: summaryMeta.title || scrapeResult.title,
        cleanedText: scrapeResult.content,
        summary: summaryMeta.summary,
        publishDate: scrapeResult.publishDate ? new Date(scrapeResult.publishDate) : null,
        headings: scrapeResult.headings as any,
        topic,
        status: "PROCESSING",
      } as any,
    });

    const chunkCount = await processAndStoreChunks(source.id, scrapeResult.content);

    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "INDEXED", chunkCount },
    });

    console.log(`[Ingest] ✓ Indexed "${scrapeResult.title}" → ${chunkCount} chunks`);
    return source.id;
  } catch (err: any) {
    console.error(`[Ingest] ✗ Failed: ${err.message}`);
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "ERROR", errorMsg: err.message },
    });
    throw err;
  }
}

export async function ingestText(title: string, text: string, userId: string): Promise<string> {
  ensureKnowledgeWithinCharLimit(text, `Text source "${title || "Untitled"}"`);
  const summaryMeta = await summarizeKnowledgeSource({
    title,
    text,
    type: "TEXT",
  });
  const topic = summaryMeta.topic || detectTopic(text, title);
  const source = await db.knowledgeSource.create({
    data: {
      userId,
      type: "TEXT",
      title: summaryMeta.title || title,
      cleanedText: text,
      summary: summaryMeta.summary,
      topic,
      status: "PROCESSING",
    } as any,
  });

  try {
    const chunkCount = await processAndStoreChunks(source.id, text);
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "INDEXED", chunkCount },
    });
    return source.id;
  } catch (err: any) {
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "ERROR", errorMsg: err.message },
    });
    throw err;
  }
}

export function ingestWebsiteWithProgress(
  baseUrl: string,
  userId: string,
  options: { maxPages?: number } = {}
): AsyncIterable<WebsiteCrawlProgressEvent> {
  const events = new AsyncEventQueue<WebsiteCrawlProgressEvent>();

  void (async () => {
    try {
      console.log(`[Ingest] Starting website crawl: ${baseUrl}`);

      const maxPages = Math.min(options.maxPages || 20, 20);
      const discoveryLimit = Math.max(maxPages * 6, 120);
      const normalizedBaseUrl = normalizeCrawlUrl(baseUrl);
      const discoveredUrls = Array.from(
        new Set(
          (await discoverPages(normalizedBaseUrl, discoveryLimit))
            .map((url) => normalizeCrawlUrl(url))
            .filter((url) => isSameCrawlDomain(url, normalizedBaseUrl))
        )
      );

      const existingSources = await db.knowledgeSource.findMany({
        where: {
          userId,
          type: { in: ["WEBSITE", "URL"] },
          sourceUrl: { not: null },
        },
        select: { sourceUrl: true, status: true },
      });

      const existingUrls = new Set(
        existingSources
          .filter((source) => source.status === "INDEXED")
          .map((source) => source.sourceUrl)
          .filter((sourceUrl): sourceUrl is string => !!sourceUrl && isSameCrawlDomain(sourceUrl, normalizedBaseUrl))
          .map((sourceUrl) => normalizeCrawlUrl(sourceUrl))
      );

      const newUrls = discoveredUrls.filter((url) => !existingUrls.has(url));
      const queuedUrls = newUrls.slice(0, maxPages);
      const skippedExisting = discoveredUrls.length - newUrls.length;
      const remaining = Math.max(newUrls.length - queuedUrls.length, 0);

      events.push({
        type: "discovered",
        baseUrl: normalizedBaseUrl,
        totalDiscovered: discoveredUrls.length,
        queued: queuedUrls.length,
        skippedExisting,
        remaining,
        limit: maxPages,
      });

      let processed = 0;
      let indexed = 0;
      let errors = 0;
      const queue = [...queuedUrls];

      const worker = async () => {
        while (queue.length > 0) {
          const url = queue.shift();
          if (!url) return;

          const source = await db.knowledgeSource.create({
            data: {
              userId,
              type: "WEBSITE",
              title: url,
              sourceUrl: url,
              status: "CRAWLING",
            },
          });

          events.push({
            type: "page",
            phase: "reading",
            url,
            processed,
            total: queuedUrls.length,
            indexed,
            errors,
            remaining,
          });

          try {
            const result = await scrapeUrl(url, { mode: "stealth" });
            ensureKnowledgeWithinCharLimit(result.content, `The page at ${url}`);
            const heuristic = detectTopic(result.content, result.title);

            await db.knowledgeSource.update({
              where: { id: source.id },
              data: {
                title: result.title,
                cleanedText: result.content,
                publishDate: result.publishDate ? new Date(result.publishDate) : null,
                headings: result.headings as any,
                topic: heuristic,
                status: "PROCESSING",
              } as any,
            });

            const [summaryMeta, chunkCount] = await Promise.all([
              summarizeKnowledgeSource({
                title: result.title,
                text: result.content,
                sourceUrl: result.url,
                type: "WEBSITE",
              }),
              processAndStoreChunks(source.id, result.content),
            ]);

            await db.knowledgeSource.update({
              where: { id: source.id },
              data: {
                title: summaryMeta.title || result.title,
                summary: summaryMeta.summary,
                topic: summaryMeta.topic || heuristic,
                status: "INDEXED",
                chunkCount,
              },
            });

            indexed++;
            processed++;

            events.push({
              type: "page",
              phase: "indexed",
              url,
              title: summaryMeta.title || result.title,
              processed,
              total: queuedUrls.length,
              indexed,
              errors,
              remaining,
            });
          } catch (err: any) {
            processed++;
            errors++;
            console.error(`[Ingest] Failed to process ${url}: ${err.message}`);

            await db.knowledgeSource.update({
              where: { id: source.id },
              data: {
                status: "ERROR",
                errorMsg: err.message,
              },
            });

            events.push({
              type: "page",
              phase: "error",
              url,
              processed,
              total: queuedUrls.length,
              indexed,
              errors,
              remaining,
              error: err.message,
            });
          }
        }
      };

      const concurrency = Math.min(WEBSITE_CRAWL_CONCURRENCY, Math.max(queuedUrls.length, 1));
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      events.push({
        type: "done",
        baseUrl: normalizedBaseUrl,
        totalDiscovered: discoveredUrls.length,
        queued: queuedUrls.length,
        skippedExisting,
        remaining,
        processed,
        indexed,
        errors,
      });
      events.close();
    } catch (err: any) {
      events.fail(err instanceof Error ? err : new Error(err?.message || "Website crawl failed"));
    }
  })();

  return events;
}

export async function ingestWebsite(baseUrl: string, userId: string, options: { maxPages?: number } = {}) {
  let result = {
    total: 0,
    indexed: 0,
    errors: 0,
    queued: 0,
    skippedExisting: 0,
    remaining: 0,
  };

  for await (const event of ingestWebsiteWithProgress(baseUrl, userId, options)) {
    if (event.type === "done") {
      result = {
        total: event.totalDiscovered,
        indexed: event.indexed,
        errors: event.errors,
        queued: event.queued,
        skippedExisting: event.skippedExisting,
        remaining: event.remaining,
      };
    }
  }

  return result;
}

export async function ingestFile(buffer: Buffer, filename: string, userId: string): Promise<string> {
  console.log(`[Ingest] Starting file: ${filename}`);
  const source = await db.knowledgeSource.create({
    data: {
      userId,
      type: "UPLOAD",
      title: filename.replace(/\.\w+$/, ""),
      fileName: filename,
      status: "PROCESSING",
    },
  });

  try {
    const { parseFile } = await import("./file-parser");
    const { text, title } = await parseFile(buffer, filename);
    if (!text || text.trim().length < 10) throw new Error("File contained no extractable text");
    ensureKnowledgeWithinCharLimit(text, `File "${filename}"`);
    console.log(`[Ingest] Parsed: "${title}" (${text.split(/\s+/).length} words)`);

    const topic = detectTopic(text, title);
    const summaryMeta = await summarizeKnowledgeSource({
      title,
      text,
      type: "UPLOAD",
    });

    await db.knowledgeSource.update({
      where: { id: source.id },
      data: {
        title: summaryMeta.title || title,
        cleanedText: text,
        summary: summaryMeta.summary,
        topic: summaryMeta.topic || topic,
        status: "PROCESSING",
      } as any,
    });

    const chunkCount = await processAndStoreChunks(source.id, text);
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "INDEXED", chunkCount },
    });
    console.log(`[Ingest] Indexed "${title}" -> ${chunkCount} chunks`);
    return source.id;
  } catch (err: any) {
    console.error(`[Ingest] File error: ${err.message}`);
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "ERROR", errorMsg: err.message },
    });
    throw err;
  }
}

export async function resyncAllContent(userId: string) {
  const sources = await db.knowledgeSource.findMany({ where: { userId, status: "INDEXED" } });
  let reindexed = 0;
  let errors = 0;

  for (const source of sources) {
    try {
      await db.contentChunk.deleteMany({ where: { sourceId: source.id } });
      const text = source.cleanedText || "";
      const chunkCount = await processAndStoreChunks(source.id, text);
      const summaryMeta = await summarizeKnowledgeSource({
        title: source.title,
        text,
        sourceUrl: source.sourceUrl,
        type: source.type,
      });
      await db.knowledgeSource.update({
        where: { id: source.id },
        data: {
          title: summaryMeta.title || source.title,
          summary: summaryMeta.summary,
          topic: summaryMeta.topic || detectTopic(text, source.title),
          chunkCount,
        },
      });
      reindexed++;
    } catch {
      errors++;
    }
  }

  return { reindexed, errors };
}
