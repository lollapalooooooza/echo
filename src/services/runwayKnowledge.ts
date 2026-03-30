import { createHash } from "crypto";

import { db } from "@/lib/db";
import { getRunwayClient } from "@/services/runwayClient";

const MAX_RUNWAY_DOCUMENT_CONTENT_CHARS = 24_000;

type KnowledgeSourceForRunway = {
  id: string;
  userId: string;
  title: string;
  type: string;
  sourceUrl: string | null;
  fileName: string | null;
  summary: string | null;
  topic: string | null;
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

function buildRunwayDocumentContent(source: KnowledgeSourceForRunway) {
  const body = compactText(source.cleanedText || source.rawContent);
  const sections = [`# ${buildRunwayDocumentName(source)}`];

  if (source.sourceUrl) sections.push(`Source URL: ${source.sourceUrl}`);
  if (source.topic) sections.push(`Topic: ${source.topic}`);
  if (source.summary) sections.push(`Summary:\n${compactText(source.summary)}`);
  if (body) sections.push(`Content:\n${body.slice(0, MAX_RUNWAY_DOCUMENT_CONTENT_CHARS)}`);

  return sections.join("\n\n");
}

function buildRunwayDocumentHash(source: KnowledgeSourceForRunway) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: buildRunwayDocumentName(source),
        sourceUrl: source.sourceUrl || "",
        topic: source.topic || "",
        summary: compactText(source.summary),
        content: compactText(source.cleanedText || source.rawContent).slice(0, MAX_RUNWAY_DOCUMENT_CONTENT_CHARS),
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

  return documentIds;
}
