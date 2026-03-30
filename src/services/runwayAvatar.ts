import type RunwayML from "@runwayml/sdk";

import { getRunwayClient } from "@/services/runwayClient";
import { toRunwayImageSource } from "@/services/runwayAssets";
import {
  buildRunwayPersonality,
  DEFAULT_RUNWAY_LIVE_VOICE_PRESET,
  inferRunwayLiveVoicePreset,
  type RunwayLiveVoicePreset,
} from "@/services/runwayVoice";

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
  const voicePreset = input.voicePreset
    ? inferRunwayLiveVoicePreset({
        voiceId: input.voicePreset,
        voiceName: input.voicePreset,
        tone: input.personalityTone,
        bio: input.bio,
      })
    : DEFAULT_RUNWAY_LIVE_VOICE_PRESET;

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
    voicePreset?: string;
    documentIds?: string[];
  }
) {
  const client = getRunwayClient();

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
    voice: input.voicePreset
      ? {
          type: "runway-live-preset",
          presetId: inferRunwayLiveVoicePreset({
            voiceId: input.voicePreset,
            voiceName: input.voicePreset,
            tone: input.personalityTone,
            bio: input.bio,
          }) as RunwayLiveVoicePreset,
        }
      : undefined,
  });
}

export async function getRunwayAvatar(avatarId: string) {
  const client = getRunwayClient();
  return client.avatars.retrieve(avatarId);
}

export function getRunwayAvatarStatus(avatar: AvatarResponse) {
  return avatar.status;
}
