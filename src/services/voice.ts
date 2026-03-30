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

export async function cloneVoice(name: string, audioBuffer: ArrayBuffer): Promise<string> {
  return cloneVoiceNew(name, audioBuffer);
}

export async function listVoices() {
  const { presets, custom } = await listVoicesNew();
  // Flatten back to legacy format for existing API routes
  return [
    ...presets.map((p) => ({ voice_id: p.id, name: p.name, category: "preset" })),
    ...custom.map((v: any) => ({ voice_id: v.voice_id, name: v.name, category: v.category })),
  ];
}
