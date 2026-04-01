// ──────────────────────────────────────────────────────────────
// Voice Service — ElevenLabs integration with streaming support
// ──────────────────────────────────────────────────────────────

import { env } from "@/lib/env";
import { RUNWAY_LIVE_VOICE_PRESETS, type RunwayLiveVoicePreset } from "@/services/runwayVoice";

const BASE = "https://api.elevenlabs.io/v1";
const MAX_CLONE_FILE_BYTES = 11 * 1024 * 1024;
const SAFE_CLONE_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
]);

function headers() {
  return {
    "xi-api-key": env.ELEVENLABS_API_KEY,
    "Content-Type": "application/json",
  };
}

async function readElevenLabsError(response: Response) {
  const text = await response.text().catch(() => "");

  try {
    const data = JSON.parse(text);
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (detail?.message) return String(detail.message);
    if (data?.error) return String(data.error);
  } catch {
    /* ignore JSON parse failures */
  }

  return text.trim() || `Request failed with status ${response.status}`;
}

// ── Voice Presets ────────────────────────────────────────────

const RUNWAY_TO_ELEVENLABS_PRESET: Record<RunwayLiveVoicePreset, string> = {
  adrian: "29vD33N1CtxCmqQRPOHJ",
  clara: "21m00Tcm4TlvDq8ikWAM",
  drew: "29vD33N1CtxCmqQRPOHJ",
  emma: "IKne3meq5aSn9XLyUdCD",
  maya: "EXAVITQu4vr4xnSDxMaL",
  nathan: "29vD33N1CtxCmqQRPOHJ",
  luna: "XB0fDUnXU5powFXDhCwa",
  roman: "29vD33N1CtxCmqQRPOHJ",
  petra: "EXAVITQu4vr4xnSDxMaL",
  violet: "XB0fDUnXU5powFXDhCwa",
};

const RUNWAY_PRESET_DESCRIPTIONS: Record<RunwayLiveVoicePreset, string> = {
  adrian: "Runway live preset - grounded and professional",
  clara: "Runway live preset - warm and conversational",
  drew: "Runway live preset - deep and authoritative",
  emma: "Runway live preset - bright and energetic",
  maya: "Runway live preset - calm and thoughtful",
  nathan: "Runway live preset - casual and friendly",
  luna: "Runway live preset - soft and creative",
  roman: "Runway live preset - bold and witty",
  petra: "Runway live preset - precise and academic",
  violet: "Runway live preset - playful and lively",
};

export const PRESET_VOICES = RUNWAY_LIVE_VOICE_PRESETS.map((voice) => ({
  id: voice.id,
  name: voice.name,
  desc: RUNWAY_PRESET_DESCRIPTIONS[voice.id],
}));

function resolveSynthVoiceId(voiceId: string) {
  return RUNWAY_TO_ELEVENLABS_PRESET[voiceId as RunwayLiveVoicePreset] || voiceId;
}

export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.3,
  useSpeakerBoost: true,
};

// ── Simple In-Memory Audio Cache ─────────────────────────────

const audioCache = new Map<string, { buffer: ArrayBuffer; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

function getCacheKey(voiceId: string, text: string): string {
  // Simple hash for cache key
  let hash = 0;
  const str = `${voiceId}:${text}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `voice_${hash}`;
}

function getFromCache(key: string): ArrayBuffer | null {
  const entry = audioCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    audioCache.delete(key);
    return null;
  }
  return entry.buffer;
}

function setCache(key: string, buffer: ArrayBuffer): void {
  // Evict oldest entries if cache is full
  if (audioCache.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(audioCache.entries());
    const oldest = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) audioCache.delete(oldest[0]);
  }
  audioCache.set(key, { buffer, timestamp: Date.now() });
}

// ── Core Voice Functions ─────────────────────────────────────

/**
 * Generate speech from text. Returns audio buffer.
 * Includes caching for repeated requests.
 */
export async function generateSpeech(
  text: string,
  voiceId: string,
  settings?: Partial<VoiceSettings>
): Promise<ArrayBuffer> {
  if (!env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

  // Check cache first
  const cacheKey = getCacheKey(voiceId, text);
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[Voice] Cache hit for ${text.length} chars`);
    return cached;
  }

  const voiceSettings = { ...DEFAULT_VOICE_SETTINGS, ...settings };
  const synthVoiceId = resolveSynthVoiceId(voiceId);
  console.log(`[Voice] Synthesizing ${text.length} chars with voice ${voiceId}${synthVoiceId !== voiceId ? ` -> ${synthVoiceId}` : ""}`);

  const res = await fetch(`${BASE}/text-to-speech/${synthVoiceId}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      text: text.slice(0, 5000),
      model_id: env.ELEVENLABS_MODEL,
      voice_settings: {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarityBoost,
        style: voiceSettings.style,
        use_speaker_boost: voiceSettings.useSpeakerBoost,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Voice] TTS failed: ${res.status}`, err);
    throw new Error(`ElevenLabs TTS failed: ${res.status}${err ? ` — ${err.slice(0, 220)}` : ""}`);
  }

  const buf = await res.arrayBuffer();
  console.log(`[Voice] ✓ Generated ${(buf.byteLength / 1024).toFixed(1)}KB audio`);

  // Cache the result
  setCache(cacheKey, buf);
  return buf;
}

/**
 * Generate speech as a stream for low-latency playback.
 * Future-ready for real-time streaming.
 */
export async function generateSpeechStream(
  text: string,
  voiceId: string,
  settings?: Partial<VoiceSettings>
): Promise<ReadableStream<Uint8Array>> {
  if (!env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

  const voiceSettings = { ...DEFAULT_VOICE_SETTINGS, ...settings };
  const synthVoiceId = resolveSynthVoiceId(voiceId);

  const res = await fetch(`${BASE}/text-to-speech/${synthVoiceId}/stream`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      text: text.slice(0, 5000),
      model_id: env.ELEVENLABS_MODEL,
      voice_settings: {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarityBoost,
        style: voiceSettings.style,
        use_speaker_boost: voiceSettings.useSpeakerBoost,
      },
      optimize_streaming_latency: 3,
      output_format: "mp3_44100_128",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs stream failed: ${res.status}${err ? ` — ${err.slice(0, 220)}` : ""}`);
  }
  return res.body!;
}

/**
 * Clone a voice from an audio sample.
 * Returns the new ElevenLabs voice ID.
 */
export async function cloneVoice(
  name: string,
  audioBuffer: ArrayBuffer,
  file?: {
    name?: string | null;
    contentType?: string | null;
    size?: number | null;
  }
): Promise<string> {
  if (!env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

  const fileSize = file?.size ?? audioBuffer.byteLength;
  if (fileSize > MAX_CLONE_FILE_BYTES) {
    throw new Error("Audio sample is too large. ElevenLabs currently accepts files up to 11MB.");
  }

  const contentType = (file?.contentType || "").trim().toLowerCase();
  if (contentType && !SAFE_CLONE_MIME_TYPES.has(contentType)) {
    throw new Error("Unsupported audio format. Please upload WAV, MP3, M4A, OGG, or WebM.");
  }

  const form = new FormData();
  form.append("name", name);
  form.append(
    "files",
    new Blob([audioBuffer], { type: contentType || "audio/mpeg" }),
    file?.name?.trim() || "sample.mp3"
  );

  const res = await fetch(`${BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    body: form,
  });

  if (!res.ok) {
    const message = await readElevenLabsError(res);
    throw new Error(`ElevenLabs clone failed: ${message}`);
  }
  const data = await res.json();
  console.log(`[Voice] ✓ Cloned voice: ${data.voice_id}`);
  return data.voice_id;
}

export async function deleteClonedVoice(elevenLabsVoiceId: string): Promise<void> {
  if (!env.ELEVENLABS_API_KEY) return;

  const res = await fetch(`${BASE}/voices/${elevenLabsVoiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
  });

  if (res.ok || res.status === 404) {
    return;
  }

  const message = await readElevenLabsError(res);
  throw new Error(`ElevenLabs delete failed: ${message}`);
}

/**
 * List all available voices (preset + user's cloned voices).
 */
export async function listVoices() {
  if (!env.ELEVENLABS_API_KEY) {
    return { presets: PRESET_VOICES, custom: [] };
  }

  try {
    const res = await fetch(`${BASE}/voices`, { headers: headers() });
    if (!res.ok) throw new Error(`ElevenLabs list failed: ${res.status}`);
    const data = await res.json();
    const custom = (data.voices || []).filter(
      (v: any) => v.category === "cloned" || v.category === "generated"
    );
    return { presets: PRESET_VOICES, custom };
  } catch (e) {
    console.warn("[Voice] Failed to list voices:", e);
    return { presets: PRESET_VOICES, custom: [] };
  }
}
