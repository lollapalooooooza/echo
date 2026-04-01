// ──────────────────────────────────────────────────────────────
// Character Service — Runway Character API integration layer
// ──────────────────────────────────────────────────────────────
// Manages character lifecycle: creation, update, live sessions.
// Provides clean abstraction over Runway API + internal state.
// ──────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { RunwayCharacterConfig, RunwaySessionInfo } from "@/types";
import { createRunwayAvatar, updateRunwayAvatar } from "@/services/runwayAvatar";
import { syncRunwayKnowledgeToAvatar } from "@/services/runwayKnowledge";
import { PRESET_VOICES } from "@/services/voiceService";
import { DEFAULT_RUNWAY_LIVE_VOICE_PRESET, inferRunwayLiveVoicePreset } from "@/services/runwayVoice";

// ── Runway API Configuration ─────────────────────────────────

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";

function runwayHeaders() {
  if (!env.RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY is not configured");
  return {
    Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
    "Content-Type": "application/json",
    "X-Runway-Version": "2024-11-06",
  };
}

// ── Runway Voice Presets ─────────────────────────────────────

export const RUNWAY_VOICE_PRESETS = [
  { id: "adrian", name: "Adrian", desc: "Deep, professional male" },
  { id: "clara", name: "Clara", desc: "Warm, conversational female" },
  { id: "emma", name: "Emma", desc: "Bright, energetic female" },
  { id: "maya", name: "Maya", desc: "Calm, thoughtful female" },
  { id: "nathan", name: "Nathan", desc: "Friendly, casual male" },
  { id: "luna", name: "Luna", desc: "Soft, creative female" },
] as const;

export const DEFAULT_RUNWAY_VOICE = "clara";

// ── Character Creation ───────────────────────────────────────

export interface CreateCharacterInput {
  userId: string;
  name: string;
  bio: string;
  greeting: string;
  personalityTone: string;
  avatarUrl?: string;
  voiceId?: string;
  voiceName?: string;
  runwayCharacterId?: string;
  runwayVoicePreset?: string;
  knowledgeSourceIds?: string[];
  suggestedQuestions?: string[];
  publish?: boolean;
  allowedDomains?: string[];
  widgetTheme?: string;
  widgetPosition?: string;
}

async function resolveVoiceSelection(userId: string, voiceId?: string, voiceName?: string) {
  const selectedVoiceId = voiceId?.trim();
  if (!selectedVoiceId) {
    return { voiceDbId: null, voice: null };
  }

  const ownedVoice =
    (await db.voice.findFirst({
      where: {
        userId,
        OR: [
          { id: selectedVoiceId },
          { elevenLabsVoiceId: selectedVoiceId },
        ],
      },
      select: { id: true, name: true, elevenLabsVoiceId: true, isCloned: true },
    })) || null;

  if (ownedVoice) {
    return { voiceDbId: ownedVoice.id, voice: ownedVoice };
  }

  const preset = PRESET_VOICES.find((item) => item.id === selectedVoiceId);
  if (!preset) {
    throw new Error("Selected voice could not be found");
  }

  const voice = await db.voice.upsert({
    where: { id: `preset_${selectedVoiceId}` },
    create: {
      id: `preset_${selectedVoiceId}`,
      userId,
      name: voiceName || preset.name,
      elevenLabsVoiceId: selectedVoiceId,
      isCloned: false,
      isDefault: true,
    },
    update: {
      name: voiceName || preset.name,
      elevenLabsVoiceId: selectedVoiceId,
      isDefault: true,
    },
  });

  return { voiceDbId: voice.id, voice };
}

/**
 * Create a character with optional Runway avatar generation
 * and knowledge source linking.
 */
export async function createCharacter(input: CreateCharacterInput) {
  const slug = input.name
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check slug uniqueness
  const existing = await db.character.findUnique({ where: { slug } });
  if (existing) throw new Error("A character with this name already exists");

  const { voiceDbId, voice } = await resolveVoiceSelection(input.userId, input.voiceId, input.voiceName);
  const runwayVoicePreset =
    input.runwayVoicePreset ||
    inferRunwayLiveVoicePreset({
      voiceId: voice?.elevenLabsVoiceId || input.voiceId,
      voiceName: voice?.name || input.voiceName,
      tone: input.personalityTone,
      bio: input.bio,
    }) ||
    DEFAULT_RUNWAY_LIVE_VOICE_PRESET;

  // Create Runway avatar if needed
  let runwayCharacterId = input.runwayCharacterId?.trim() || null;
  if (!runwayCharacterId && input.avatarUrl && env.RUNWAY_API_KEY) {
    try {
      const avatar = await createRunwayAvatar({
        name: input.name,
        bio: input.bio,
        greeting: input.greeting,
        personalityTone: input.personalityTone,
        avatarUrl: input.avatarUrl,
        voicePreset: runwayVoicePreset,
      });
      runwayCharacterId = avatar.id;
    } catch (err: any) {
      console.error("[Character] Runway avatar creation failed:", err.message);
      // Don't block character creation if Runway fails
    }
  }

  // Create the character record
  const character = await db.character.create({
    data: {
      userId: input.userId,
      name: input.name,
      slug,
      avatarUrl: input.avatarUrl || null,
      bio: input.bio,
      greeting: input.greeting,
      personalityTone: input.personalityTone || "friendly",
      voiceId: voiceDbId,
      runwayCharacterId,
      suggestedQuestions: input.suggestedQuestions || [],
      status: input.publish ? "PUBLISHED" : "DRAFT",
      allowedDomains: input.allowedDomains || [],
      widgetTheme: input.widgetTheme || "light",
      widgetPosition: input.widgetPosition || "bottom-right",
    },
  });

  // Link knowledge sources if provided
  if (input.knowledgeSourceIds?.length) {
    await linkKnowledgeSources(character.id, input.knowledgeSourceIds);
  }

  if (runwayCharacterId && env.RUNWAY_API_KEY) {
    try {
      const linkedSourceIds = await getLinkedSourceIds(character.id);
      await syncRunwayKnowledgeToAvatar(runwayCharacterId, input.userId, linkedSourceIds);
      console.log(`[Character] Synced Runway knowledge to avatar ${runwayCharacterId}`);
    } catch (err: any) {
      console.error("[Character] Runway knowledge sync failed:", err.message);
    }
  }

  return character;
}

/**
 * Update an existing character
 */
export async function updateCharacter(
  characterId: string,
  userId: string,
  updates: Partial<CreateCharacterInput>
) {
  const char = await db.character.findUnique({
    where: { id: characterId },
    include: { voice: true },
  });
  if (!char || char.userId !== userId) throw new Error("Character not found");

  const resolvedVoice =
    updates.voiceId === undefined
      ? { voiceDbId: undefined, voice: char.voice || null }
      : await resolveVoiceSelection(userId, updates.voiceId, updates.voiceName);

  const runwayVoicePreset =
    inferRunwayLiveVoicePreset({
      voiceId:
        resolvedVoice.voice?.elevenLabsVoiceId ||
        (updates.voiceId === undefined ? char.voice?.elevenLabsVoiceId : updates.voiceId),
      voiceName:
        resolvedVoice.voice?.name ||
        updates.voiceName ||
        char.voice?.name,
      tone: updates.personalityTone ?? char.personalityTone,
      bio: updates.bio ?? char.bio,
    }) || DEFAULT_RUNWAY_LIVE_VOICE_PRESET;

  const updated = await db.character.update({
    where: { id: characterId },
    data: {
      name: updates.name,
      bio: updates.bio,
      greeting: updates.greeting,
      personalityTone: updates.personalityTone,
      avatarUrl: updates.avatarUrl === undefined ? undefined : updates.avatarUrl?.trim() || null,
      voiceId: resolvedVoice.voiceDbId,
      runwayCharacterId: updates.runwayCharacterId === undefined ? undefined : updates.runwayCharacterId?.trim() || null,
      suggestedQuestions: updates.suggestedQuestions,
      status: updates.publish !== undefined ? (updates.publish ? "PUBLISHED" : "DRAFT") : undefined,
      allowedDomains: updates.allowedDomains,
      widgetTheme: updates.widgetTheme,
      widgetPosition: updates.widgetPosition,
    },
  });

  // Update knowledge source links if provided
  if (updates.knowledgeSourceIds !== undefined) {
    await (db as any).characterKnowledgeSource.deleteMany({ where: { characterId } });
    if (updates.knowledgeSourceIds.length > 0) {
      await linkKnowledgeSources(characterId, updates.knowledgeSourceIds);
    }
  }

  const shouldSyncRunwayAvatar =
    updates.name !== undefined ||
    updates.bio !== undefined ||
    updates.greeting !== undefined ||
    updates.personalityTone !== undefined ||
    updates.avatarUrl !== undefined ||
    updates.voiceId !== undefined ||
    updates.voiceName !== undefined;

  if (updated.runwayCharacterId && env.RUNWAY_API_KEY && shouldSyncRunwayAvatar) {
    try {
      await updateRunwayAvatar(updated.runwayCharacterId, {
        name: updated.name,
        bio: updated.bio,
        greeting: updated.greeting,
        personalityTone: updated.personalityTone,
        avatarUrl: updated.avatarUrl || undefined,
        voicePreset: runwayVoicePreset,
      });
      console.log(`[Character] Synced Runway avatar profile for ${updated.runwayCharacterId}`);
    } catch (err: any) {
      console.error("[Character] Runway avatar sync failed after update:", err.message);
    }
  }

  if (updated.runwayCharacterId && env.RUNWAY_API_KEY && (updates.knowledgeSourceIds !== undefined || updates.runwayCharacterId !== undefined)) {
    try {
      const linkedSourceIds = await getLinkedSourceIds(characterId);
      await syncRunwayKnowledgeToAvatar(updated.runwayCharacterId, userId, linkedSourceIds);
      console.log(`[Character] Synced updated Runway knowledge to avatar ${updated.runwayCharacterId}`);
    } catch (err: any) {
      console.error("[Character] Runway knowledge sync failed after update:", err.message);
    }
  }

  return updated;
}

// ── Knowledge Source Linking ──────────────────────────────────

/**
 * Link specific knowledge sources to a character.
 * Only chunks from linked sources will be used for RAG retrieval.
 */
export async function linkKnowledgeSources(
  characterId: string,
  sourceIds: string[]
): Promise<void> {
  const creates = sourceIds.map((sourceId) => ({
    characterId,
    sourceId,
  }));

  await (db as any).characterKnowledgeSource.createMany({
    data: creates,
    skipDuplicates: true,
  });

  console.log(`[Character] Linked ${sourceIds.length} knowledge sources to character ${characterId}`);
}

/**
 * Get knowledge source IDs linked to a character.
 * Returns empty array if no specific sources linked (means use all).
 */
export async function getLinkedSourceIds(characterId: string): Promise<string[]> {
  const links = await (db as any).characterKnowledgeSource.findMany({
    where: { characterId },
    select: { sourceId: true },
  });
  return links.map((l: any) => l.sourceId);
}

// ── Runway Character API ─────────────────────────────────────

interface CreateRunwayCharacterInput {
  name: string;
  avatarUrl: string;
  voicePreset?: string;
  personalityInstructions?: string;
}

/**
 * Create a Runway character avatar for live video sessions.
 * Returns the Runway character ID.
 */
async function createRunwayCharacter(input: CreateRunwayCharacterInput): Promise<string> {
  console.log(`[Character] Creating Runway avatar for "${input.name}"`);

  // Runway Character API payload
  const payload = {
    name: input.name,
    image: input.avatarUrl,
    voice: input.voicePreset || DEFAULT_RUNWAY_VOICE,
    instructions: input.personalityInstructions || "",
  };

  const res = await fetch(`${RUNWAY_BASE}/characters`, {
    method: "POST",
    headers: runwayHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Character] Runway create failed: ${res.status}`, body);
    throw new Error(`Runway avatar creation failed: ${res.status}`);
  }

  const data = await res.json();
  console.log(`[Character] ✓ Runway avatar created: ${data.id}`);
  return data.id;
}

/**
 * Start a live video session for a character.
 * Returns session info with credentials for WebRTC connection.
 */
export async function startLiveSession(
  characterId: string,
  maxDuration = 300
): Promise<RunwaySessionInfo> {
  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character?.runwayCharacterId) {
    throw new Error("Character does not have a Runway avatar configured");
  }

  console.log(`[Character] Starting live session for ${character.name} (runway: ${character.runwayCharacterId})`);

  const payload = {
    characterId: character.runwayCharacterId,
    maxDuration,
  };

  const res = await fetch(`${RUNWAY_BASE}/realtime/sessions`, {
    method: "POST",
    headers: runwayHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Runway session creation failed: ${res.status} - ${body}`);
  }

  const session = await res.json();

  // Store session ID on character
  await db.character.update({
    where: { id: characterId },
    data: { runwaySessionId: session.id } as any,
  });

  console.log(`[Character] ✓ Live session created: ${session.id} (status: ${session.status})`);

  return {
    id: session.id,
    status: session.status,
    sessionKey: session.sessionKey,
    expiresAt: session.expiresAt,
    duration: session.duration,
    failure: session.failure,
  };
}

/**
 * Get the status of a live session.
 */
export async function getLiveSessionStatus(sessionId: string): Promise<RunwaySessionInfo> {
  const res = await fetch(`${RUNWAY_BASE}/realtime/sessions/${sessionId}`, {
    headers: runwayHeaders(),
  });

  if (!res.ok) throw new Error(`Runway session lookup failed: ${res.status}`);
  const session = await res.json();

  return {
    id: session.id,
    status: session.status,
    sessionKey: session.sessionKey,
    expiresAt: session.expiresAt,
    duration: session.duration,
    failure: session.failure,
  };
}

/**
 * End a live session.
 */
export async function endLiveSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${RUNWAY_BASE}/realtime/sessions/${sessionId}`, {
      method: "DELETE",
      headers: runwayHeaders(),
    });
    console.log(`[Character] ✓ Live session ended: ${sessionId}`);
  } catch (e) {
    console.warn("[Character] Failed to end live session:", e);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function buildPersonalityInstructions(
  name: string,
  bio: string,
  tone: string,
  greeting: string
): string {
  return `Adopt a ${tone} speaking style. ${bio}

When a conversation begins, greet with: "${greeting}"

Stay grounded in the requested persona without using any personal name. Speak naturally as if in a live video conversation.`;
}
