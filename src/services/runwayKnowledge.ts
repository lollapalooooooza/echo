import { createHash } from "crypto";

import { db } from "@/lib/db";
import { getRunwayClient } from "@/services/runwayClient";

const MAX_RUNWAY_DOCUMENT_CONTENT_CHARS = 9_000;
const MAX_RUNWAY_HEADINGS = 10;
const MAX_RUNWAY_HIGHLIGHTS = 28;
const MAX_RUNWAY_HIGHLIGHT_CHARS = 5_800;

type KnowledgeSourceForRunway = {
  id: string;
  userId: string;
  title: string;
  type: string;
  sourceUrl: string | null;
  fileName: string | null;
  summary: string | null;
  topic: string | null;
  headings: unknown;
  cleanedText: string | null;
  rawContent: string | null;
  status: string;
  runwayDocumentId: string | null;
  runwayDocumentHash: string | null;
};

function compactText(text: string | null | undefined) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function buildRunwayDocumentName(source: KnowledgeSourceForRunway) {
  return compactText(source.title || source.fileName || "Knowledge source").slice(0, 120) || "Knowledge source";
}

function cleanKnowledgeLine(value: string, maxLength = 260) {
  const normalized = compactText(value)
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+([,.;!?])/g, "$1");

  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getHeadingTexts(headings: unknown) {
  if (!Array.isArray(headings)) return [] as string[];

  return headings
    .map((heading) => {
      if (!heading || typeof heading !== "object") return "";
      return cleanKnowledgeLine(String((heading as any).text || ""), 140);
    })
    .filter(Boolean)
    .slice(0, MAX_RUNWAY_HEADINGS);
}

function chunkWords(text: string, size = 22) {
  const words = compactText(text).split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size).join(" "));
  }

  return chunks;
}

function buildKnowledgeKeywords(source: KnowledgeSourceForRunway, headingTexts: string[]) {
  return Array.from(
    new Set(
      [source.title, source.topic, source.summary, ...headingTexts]
        .join(" ")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 4)
    )
  );
}

function buildRunwayHighlights(source: KnowledgeSourceForRunway, headingTexts: string[]) {
  const body = compactText(source.cleanedText || source.rawContent);
  if (!body) return [] as string[];

  const rawSentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => cleanKnowledgeLine(sentence, 280))
    .filter((sentence) => sentence.length >= 45);

  const candidates = rawSentences.length > 0
    ? rawSentences
    : chunkWords(body, 22)
        .map((sentence) => cleanKnowledgeLine(sentence, 220))
        .filter((sentence) => sentence.length >= 45);

  const keywords = buildKnowledgeKeywords(source, headingTexts);
  const scored = candidates.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const keywordHits = keywords.reduce((total, keyword) => (lower.includes(keyword) ? total + 1 : total), 0);
    const lengthScore = sentence.length >= 80 && sentence.length <= 220 ? 3 : sentence.length <= 280 ? 1 : -2;
    const positionScore = Math.max(0, 5 - Math.floor(index / 3));
    const structureScore = /:|;|\d/.test(sentence) ? 1 : 0;

    return {
      sentence,
      index,
      score: keywordHits * 4 + positionScore + lengthScore + structureScore,
    };
  });

  const selected = scored
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, MAX_RUNWAY_HIGHLIGHTS * 2)
    .sort((left, right) => left.index - right.index);

  const highlights: string[] = [];
  const seen = new Set<string>();
  let usedChars = 0;

  for (const item of selected) {
    const normalized = item.sentence.toLowerCase();
    if (seen.has(normalized)) continue;

    const nextLength = usedChars + item.sentence.length + 3;
    if (nextLength > MAX_RUNWAY_HIGHLIGHT_CHARS) break;

    highlights.push(item.sentence);
    seen.add(normalized);
    usedChars = nextLength;

    if (highlights.length >= MAX_RUNWAY_HIGHLIGHTS) break;
  }

  return highlights;
}

function buildRunwayDocumentContent(source: KnowledgeSourceForRunway) {
  const headingTexts = getHeadingTexts(source.headings);
  const highlights = buildRunwayHighlights(source, headingTexts);
  const sections = [`# ${buildRunwayDocumentName(source)}`];

  if (source.sourceUrl) sections.push(`Source URL: ${source.sourceUrl}`);
  if (source.topic) sections.push(`Topic: ${cleanKnowledgeLine(source.topic, 120)}`);
  if (source.summary) sections.push(`Summary:\n${cleanKnowledgeLine(source.summary, 360)}`);
  if (headingTexts.length > 0) {
    sections.push(`Key sections:\n${headingTexts.map((heading) => `- ${heading}`).join("\n")}`);
  }
  if (highlights.length > 0) {
    sections.push(`Compressed knowledge:\n${highlights.map((highlight) => `- ${highlight}`).join("\n")}`);
  }

  const content = sections.join("\n\n");
  if (content.length <= MAX_RUNWAY_DOCUMENT_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_RUNWAY_DOCUMENT_CONTENT_CHARS - 1).trimEnd()}…`;

}

function buildRunwayDocumentHash(source: KnowledgeSourceForRunway) {
  const content = buildRunwayDocumentContent(source);
  return createHash("sha256")
    .update(
      JSON.stringify({
        content,
      })
    )
    .digest("hex");
}

async function ensureRunwayDocumentForSource(source: KnowledgeSourceForRunway) {
  if (source.status !== "INDEXED") {
    throw new Error(`Knowledge source "${source.title}" is not indexed yet`);
  }

  const content = buildRunwayDocumentContent(source);
  if (!content.trim()) {
    throw new Error(`Knowledge source "${source.title}" does not contain text that Runway can attach`);
  }

  const client = getRunwayClient();
  const nextHash = buildRunwayDocumentHash(source);

  if (source.runwayDocumentId && source.runwayDocumentHash === nextHash) {
    return source.runwayDocumentId;
  }

  if (source.runwayDocumentId) {
    try {
      await client.documents.delete(source.runwayDocumentId);
    } catch (error) {
      console.warn(`[RunwayKnowledge] Failed to delete stale document ${source.runwayDocumentId}:`, error);
    }
  }

  const document = await client.documents.create({
    name: buildRunwayDocumentName(source),
    content,
  });
  const verifiedDocument = await client.documents.retrieve(document.id);
  if (!verifiedDocument.content?.trim()) {
    throw new Error(`Runway document ${document.id} was created without readable content`);
  }

  await db.knowledgeSource.update({
    where: { id: source.id },
    data: {
      runwayDocumentId: document.id,
      runwayDocumentHash: nextHash,
      runwayDocumentSyncedAt: new Date(),
    },
  });

  return document.id;
}

export async function resolveKnowledgeSourcesForRunway(userId: string, sourceIds?: string[]) {
  const requestedIds = Array.from(new Set((sourceIds || []).filter(Boolean)));
  const where = requestedIds.length > 0
    ? { userId, id: { in: requestedIds }, status: "INDEXED" as const }
    : { userId, status: "INDEXED" as const };

  const sources = await db.knowledgeSource.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      userId: true,
      title: true,
      type: true,
      sourceUrl: true,
      fileName: true,
      summary: true,
      topic: true,
      headings: true,
      cleanedText: true,
      rawContent: true,
      status: true,
      runwayDocumentId: true,
      runwayDocumentHash: true,
    },
  });

  if (requestedIds.length > 0 && sources.length !== requestedIds.length) {
    throw new Error("Some selected knowledge sources are missing or not indexed yet");
  }

  return sources;
}

export async function getRunwayDocumentIdsForKnowledgeSources(userId: string, sourceIds?: string[]) {
  const sources = await resolveKnowledgeSourcesForRunway(userId, sourceIds);
  if (sources.length === 0) return [] as string[];

  const documentIds: string[] = [];
  for (const source of sources) {
    documentIds.push(await ensureRunwayDocumentForSource(source));
  }

  return documentIds;
}

export async function syncRunwayKnowledgeToAvatar(avatarId: string, userId: string, sourceIds?: string[]) {
  const client = getRunwayClient();
  const documentIds = await getRunwayDocumentIdsForKnowledgeSources(userId, sourceIds);

  await client.avatars.update(avatarId, {
    documentIds,
  });
  await verifyAvatarDocumentAttachment(avatarId, documentIds);

  return documentIds;
}

async function verifyAvatarDocumentAttachment(avatarId: string, documentIds: string[]) {
  const client = getRunwayClient();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const avatar = await client.avatars.retrieve(avatarId);
    const attachedDocumentIds = Array.isArray((avatar as any).documentIds)
      ? ((avatar as any).documentIds as string[])
      : [];
    const attached = new Set(attachedDocumentIds);
    const missing = documentIds.filter((documentId) => !attached.has(documentId));

    if (missing.length === 0) {
      console.log(`[RunwayKnowledge] Verified ${documentIds.length} attached documents on avatar ${avatarId}`);
      return;
    }

    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await client.avatars.update(avatarId, { documentIds });
    }
  }

  throw new Error(`Runway knowledge sync incomplete for avatar ${avatarId}`);
}
