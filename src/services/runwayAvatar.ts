import type RunwayML from "@runwayml/sdk";

import { getRunwayClient } from "@/services/runwayClient";
import { toRunwayImageSource } from "@/services/runwayAssets";

export const RUNWAY_LIVE_VOICE_PRESETS = [
  { id: "adrian", name: "Adrian" },
  { id: "clara", name: "Clara" },
  { id: "emma", name: "Emma" },
  { id: "maya", name: "Maya" },
  { id: "nathan", name: "Nathan" },
  { id: "luna", name: "Luna" },
] as const;

export type RunwayLiveVoicePreset = (typeof RUNWAY_LIVE_VOICE_PRESETS)[number]["id"];

export const DEFAULT_RUNWAY_LIVE_VOICE_PRESET: RunwayLiveVoicePreset = "adrian";

function buildPersonality(name: string, bio: string, tone: string) {
  return [
    `You are ${name}.`,
    `Your speaking tone should be ${tone || "friendly"}.`,
    bio?.trim() ? `Stay grounded in this identity and expertise: ${bio.trim()}` : "Be concise, clear, and conversational.",
    "When unsure, say so directly instead of inventing details.",
  ].join(" ");
}

type AvatarResponse =
  | RunwayML.AvatarCreateResponse
  | RunwayML.AvatarRetrieveResponse
  | RunwayML.AvatarUpdateResponse;

export async function createRunwayAvatar(input: {
  name: string;
  bio: string;
  greeting: string;
  personalityTone: string;
  avatarUrl: string;
  voicePreset?: string;
  documentIds?: string[];
}) {
  const client = getRunwayClient();
  const referenceImage = await toRunwayImageSource(input.avatarUrl);
  const voicePreset = (input.voicePreset || DEFAULT_RUNWAY_LIVE_VOICE_PRESET) as RunwayLiveVoicePreset;

  return client.avatars.create({
    name: input.name,
    personality: buildPersonality(input.name, input.bio, input.personalityTone),
    referenceImage,
    startScript: input.greeting || undefined,
    imageProcessing: "optimize",
    documentIds: input.documentIds,
    voice: {
      type: "runway-live-preset",
      presetId: voicePreset,
    },
  });
}

export async function updateRunwayAvatar(
  avatarId: string,
  input: {
    name?: string;
    bio?: string;
    greeting?: string;
    personalityTone?: string;
    avatarUrl?: string;
    documentIds?: string[];
  }
) {
  const client = getRunwayClient();

  return client.avatars.update(avatarId, {
    name: input.name,
    personality:
      input.name && input.bio !== undefined && input.personalityTone !== undefined
        ? buildPersonality(input.name, input.bio, input.personalityTone)
        : undefined,
    startScript: input.greeting,
    referenceImage: input.avatarUrl ? await toRunwayImageSource(input.avatarUrl) : undefined,
    documentIds: input.documentIds,
    imageProcessing: input.avatarUrl ? "optimize" : undefined,
  });
}

export async function getRunwayAvatar(avatarId: string) {
  const client = getRunwayClient();
  return client.avatars.retrieve(avatarId);
}

export function getRunwayAvatarStatus(avatar: AvatarResponse) {
  return avatar.status;
}
