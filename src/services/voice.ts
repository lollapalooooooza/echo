// ──────────────────────────────────────────────────────────────
// Legacy voice interface — delegates to voiceService.ts
// ──────────────────────────────────────────────────────────────
// Maintained for backward compatibility with existing API routes.
// New code should use `@/services/voiceService` directly.
// ──────────────────────────────────────────────────────────────

import {
  generateSpeech,
  generateSpeechStream,
  cloneVoice as cloneVoiceNew,
  createDesignedVoice as createDesignedVoiceNew,
  designVoicePreviews as designVoicePreviewsNew,
  deleteClonedVoice as deleteClonedVoiceNew,
  listVoices as listVoicesNew,
  PRESET_VOICES,
} from "./voiceService";

export { PRESET_VOICES };

export async function synthesize(voiceId: string, text: string): Promise<ArrayBuffer> {
  return generateSpeech(text, voiceId);
}

export async function synthesizeStream(voiceId: string, text: string): Promise<ReadableStream<Uint8Array>> {
  return generateSpeechStream(text, voiceId);
}

export async function cloneVoice(
  name: string,
  audioBuffer: ArrayBuffer,
  file?: {
    name?: string | null;
    contentType?: string | null;
    size?: number | null;
  }
): Promise<string> {
  return cloneVoiceNew(name, audioBuffer, file);
}

export async function deleteClonedVoice(elevenLabsVoiceId: string): Promise<void> {
  return deleteClonedVoiceNew(elevenLabsVoiceId);
}

export async function designVoicePreviews(description: string) {
  return designVoicePreviewsNew(description);
}

export async function createDesignedVoice(
  name: string,
  description: string,
  generatedVoiceId: string
) {
  return createDesignedVoiceNew(name, description, generatedVoiceId);
}

export async function listVoices() {
  const { presets, custom } = await listVoicesNew();
  // Flatten back to legacy format for existing API routes
  return [
    ...presets.map((p) => ({ voice_id: p.id, name: p.name, category: "preset" })),
    ...custom.map((v: any) => ({ voice_id: v.voice_id, name: v.name, category: v.category })),
  ];
}
