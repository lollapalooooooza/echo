// ──────────────────────────────────────────────────────────────
// Knowledge Ingestion Pipeline — Enhanced with Scrapling support
// ──────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { scrapeUrl, crawlWebsite } from "@/services/scraping";
import { storeEmbeddings } from "./embeddings";
import { parseFile } from "./file-parser";
import type { ScrapeResult } from "@/types";

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
  const textChunks = chunkText(text);
  const records = await Promise.all(
    textChunks.map((tc) =>
      db.contentChunk.create({
        data: {
          sourceId,
          chunkIndex: tc.index,
          content: tc.content,
          heading: tc.heading,
          tokenCount: Math.ceil(tc.content.length / 4),
        },
      })
    )
  );
  await storeEmbeddings(records.map((c) => ({ id: c.id, content: c.content })));
  return records.length;
}

export async function ingestUrl(url: string, userId: string): Promise<string> {
  console.log(`[Ingest] Starting URL: ${url}`);
  const source = await db.knowledgeSource.create({
    data: { userId, type: "URL", title: url, sourceUrl: url, status: "CRAWLING" },
  });

  try {
    const scrapeResult = await scrapeUrl(url, { mode: "stealth" });
    console.log(`[Ingest] Scraped: "${scrapeResult.title}" (${scrapeResult.wordCount} words, via ${scrapeResult.fetchMethod})`);

    const topic = detectTopic(scrapeResult.content, scrapeResult.title);

    await db.knowledgeSource.update({
      where: { id: source.id },
      data: {
        title: scrapeResult.title,
        cleanedText: scrapeResult.content,
        summary: scrapeResult.content.slice(0, 300) + "…",
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
  const topic = detectTopic(text, title);
  const source = await db.knowledgeSource.create({
    data: {
      userId,
      type: "TEXT",
      title,
      cleanedText: text,
      summary: text.slice(0, 300) + "…",
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

export async function ingestWebsite(baseUrl: string, userId: string) {
  console.log(`[Ingest] Starting website crawl: ${baseUrl}`);
  const { results, errors, totalDiscovered } = await crawlWebsite(baseUrl, { maxPages: 30, mode: "stealth" });

  let indexed = 0;
  for (const result of results) {
    try {
      const topic = detectTopic(result.content, result.title);
      const source = await db.knowledgeSource.create({
        data: {
          userId,
          type: "WEBSITE",
          title: result.title,
          sourceUrl: result.url,
          cleanedText: result.content,
          summary: result.content.slice(0, 300) + "…",
          publishDate: result.publishDate ? new Date(result.publishDate) : null,
          headings: result.headings as any,
          topic,
          status: "PROCESSING",
        } as any,
      });

      const chunkCount = await processAndStoreChunks(source.id, result.content);
      await db.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "INDEXED", chunkCount },
      });
      indexed++;
    } catch (e: any) {
      console.error(`[Ingest] Failed to process ${result.url}: ${e.message}`);
    }
  }

  return { total: totalDiscovered, indexed, errors: errors.length };
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
    const { text, title } = await parseFile(buffer, filename);
    if (!text || text.trim().length < 10) throw new Error("File contained no extractable text");
    console.log(`[Ingest] Parsed: "${title}" (${text.split(/\s+/).length} words)`);

    const topic = detectTopic(text, title);

    await db.knowledgeSource.update({
      where: { id: source.id },
      data: {
        title,
        cleanedText: text,
        summary: text.slice(0, 300) + "…",
        topic,
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
      await db.knowledgeSource.update({
        where: { id: source.id },
        data: { chunkCount },
      });
      reindexed++;
    } catch {
      errors++;
    }
  }

  return { reindexed, errors };
}
