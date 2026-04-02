import type RunwayML from "@runwayml/sdk";

import { getRunwayClient } from "@/services/runwayClient";
import { toRunwayImageSource } from "@/services/runwayAssets";
import {
  buildRunwayPersonality,
  DEFAULT_RUNWAY_LIVE_VOICE_PRESET,
  normalizeRunwayLiveVoicePreset,
} from "@/services/runwayVoice";

type AvatarResponse =
  | RunwayML.AvatarCreateResponse
  | RunwayML.AvatarRetrieveResponse
  | RunwayML.AvatarUpdateResponse;

export type RunwayAvatarVoiceConfig =
  | RunwayML.AvatarCreateParams.RunwayLivePreset
  | RunwayML.AvatarCreateParams.Custom;

function normalizeRunwayAvatarVoiceConfig(input: unknown): RunwayAvatarVoiceConfig | null {
  if (!input || typeof input !== "object") return null;

  const voice = input as { type?: unknown; presetId?: unknown; id?: unknown };
  if (voice.type === "custom" && typeof voice.id === "string" && voice.id.trim()) {
    return {
      type: "custom",
      id: voice.id.trim(),
    };
  }

  if (voice.type === "runway-live-preset") {
    const presetId = normalizeRunwayLiveVoicePreset(
      typeof voice.presetId === "string"
        ? voice.presetId
        : typeof voice.id === "string"
          ? voice.id
          : null
    );

    if (presetId) {
      return {
        type: "runway-live-preset",
        presetId,
      };
    }
  }

  return null;
}

function resolveRunwayAvatarVoiceConfig(input: {
  voice?: RunwayAvatarVoiceConfig | null;
  voicePreset?: string | null;
  fallbackToDefault?: boolean;
}): RunwayAvatarVoiceConfig | null {
  const preservedVoice = normalizeRunwayAvatarVoiceConfig(input.voice);
  if (preservedVoice) {
    return preservedVoice;
  }

  const presetId = normalizeRunwayLiveVoicePreset(input.voicePreset);
  if (presetId) {
    return {
      type: "runway-live-preset",
      presetId,
    };
  }

  if (!input.fallbackToDefault) return null;

  return {
    type: "runway-live-preset",
    presetId: DEFAULT_RUNWAY_LIVE_VOICE_PRESET,
  };
}

export function getRunwayAvatarVoiceConfig(avatar: { voice?: unknown } | null | undefined) {
  return normalizeRunwayAvatarVoiceConfig(avatar?.voice);
}

export function getRunwayAvatarPreservedFields(avatar: unknown): {
  name?: string;
  personality?: string;
  startScript?: string | null;
  voice?: RunwayAvatarVoiceConfig;
} {
  if (!avatar || typeof avatar !== "object") return {};

  const source = avatar as {
    name?: unknown;
    personality?: unknown;
    startScript?: unknown;
    voice?: unknown;
  };
  const preserved: {
    name?: string;
    personality?: string;
    startScript?: string | null;
    voice?: RunwayAvatarVoiceConfig;
  } = {};

  if (typeof source.name === "string" && source.name.trim()) {
    preserved.name = source.name;
  }

  if (typeof source.personality === "string" && source.personality.trim()) {
    preserved.personality = source.personality;
  }

  if (typeof source.startScript === "string") {
    preserved.startScript = source.startScript;
  } else if (source.startScript === null) {
    preserved.startScript = null;
  }

  const voice = normalizeRunwayAvatarVoiceConfig(source.voice);
  if (voice) {
    preserved.voice = voice;
  }

  return preserved;
}

export async function createRunwayAvatar(input: {
  name: string;
  bio: string;
  greeting: string;
  personalityTone: string;
  avatarUrl: string;
  voicePreset?: string;
  voice?: RunwayAvatarVoiceConfig | null;
  documentIds?: string[];
}) {
  const client = getRunwayClient();
  const referenceImage = await toRunwayImageSource(input.avatarUrl);
  const voice = resolveRunwayAvatarVoiceConfig({
    voice: input.voice,
    voicePreset: input.voicePreset,
    fallbackToDefault: true,
  }) || {
    type: "runway-live-preset" as const,
    presetId: DEFAULT_RUNWAY_LIVE_VOICE_PRESET,
  };

  return client.avatars.create({
    name: input.name,
    personality: buildRunwayPersonality({
      name: input.name,
      bio: input.bio,
      tone: input.personalityTone,
    }),
    referenceImage,
    startScript: input.greeting || undefined,
    imageProcessing: "optimize",
    documentIds: input.documentIds,
    voice,
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
    voicePreset?: string;
    voice?: RunwayAvatarVoiceConfig | null;
    documentIds?: string[];
  }
) {
  const client = getRunwayClient();
  const shouldSendVoice = input.voice !== undefined || input.voicePreset !== undefined;
  const voice = shouldSendVoice
    ? resolveRunwayAvatarVoiceConfig({
        voice: input.voice,
        voicePreset: input.voicePreset,
        fallbackToDefault: false,
      }) || undefined
    : undefined;

  return client.avatars.update(avatarId, {
    name: input.name,
    personality:
      input.name && input.bio !== undefined && input.personalityTone !== undefined
        ? buildRunwayPersonality({
            name: input.name,
            bio: input.bio,
            tone: input.personalityTone,
          })
        : undefined,
    startScript: input.greeting,
    referenceImage: input.avatarUrl ? await toRunwayImageSource(input.avatarUrl) : undefined,
    documentIds: input.documentIds,
    imageProcessing: input.avatarUrl ? "optimize" : undefined,
    voice,
  });
}

export async function getRunwayAvatar(avatarId: string) {
  const client = getRunwayClient();
  return client.avatars.retrieve(avatarId);
}

export function getRunwayAvatarStatus(avatar: AvatarResponse) {
  return avatar.status;
}
