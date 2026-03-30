const RUNWAY_LIVE_VOICE_PRESET_DEFS = [
  { id: "adrian", name: "Adrian" },
  { id: "clara", name: "Clara" },
  { id: "drew", name: "Drew" },
  { id: "emma", name: "Emma" },
  { id: "maya", name: "Maya" },
  { id: "nathan", name: "Nathan" },
  { id: "luna", name: "Luna" },
  { id: "roman", name: "Roman" },
  { id: "petra", name: "Petra" },
  { id: "violet", name: "Violet" },
] as const;

export const RUNWAY_LIVE_VOICE_PRESETS = RUNWAY_LIVE_VOICE_PRESET_DEFS;

export type RunwayLiveVoicePreset = (typeof RUNWAY_LIVE_VOICE_PRESETS)[number]["id"];

export const DEFAULT_RUNWAY_LIVE_VOICE_PRESET: RunwayLiveVoicePreset = "clara";

const RUNWAY_PRESET_SET = new Set<string>(RUNWAY_LIVE_VOICE_PRESET_DEFS.map((voice) => voice.id));

const ELEVENLABS_TO_RUNWAY_PRESET: Record<string, RunwayLiveVoicePreset> = {
  "21m00Tcm4TlvDq8ikWAM": "clara",
  "29vD33N1CtxCmqQRPOHJ": "drew",
  EXAVITQu4vr4xnSDxMaL: "maya",
  IKne3meq5aSn9XLyUdCD: "emma",
  XB0fDUnXU5powFXDhCwa: "luna",
};

const TONE_TO_RUNWAY_PRESET: Record<string, RunwayLiveVoicePreset> = {
  friendly: "clara",
  professional: "adrian",
  casual: "nathan",
  witty: "roman",
  academic: "petra",
  storyteller: "luna",
};

const MALE_NAME_HINTS = [
  "john",
  "james",
  "david",
  "michael",
  "andrew",
  "drew",
  "charlie",
  "nathan",
  "adrian",
  "roman",
  "sam",
  "leo",
  "felix",
  "marcus",
  "vincent",
  "adam",
  "zach",
  "jasper",
  "max",
];

const FEMALE_NAME_HINTS = [
  "clara",
  "emma",
  "maya",
  "luna",
  "rachel",
  "sarah",
  "charlotte",
  "victoria",
  "ruby",
  "summer",
  "aurora",
  "nina",
  "mia",
  "georgia",
  "petra",
  "violet",
];

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanSentence(sentence: string) {
  return sentence
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim()
    .replace(/^[,:;.\-]+/, "")
    .replace(/[,:;\-]+$/, "")
    .trim();
}

function containsLikelyHumanName(sentence: string) {
  return /\b(?:mr|mrs|ms|dr|prof)\.?\s+[A-Z][a-z]+|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/.test(sentence);
}

function inferGenderHint(voiceName: string) {
  if (!voiceName) return null;
  if (MALE_NAME_HINTS.some((hint) => voiceName.includes(hint))) return "male";
  if (FEMALE_NAME_HINTS.some((hint) => voiceName.includes(hint))) return "female";
  return null;
}

function presetForGenderAndTone(
  gender: "male" | "female",
  tone: string,
  bio: string
): RunwayLiveVoicePreset {
  if (gender === "male") {
    if (tone === "witty") return "roman";
    if (tone === "casual") return "nathan";
    if (tone === "professional" || tone === "academic") return "adrian";
    if (bio.includes("creative") || bio.includes("story")) return "roman";
    return "drew";
  }

  if (tone === "witty") return "violet";
  if (tone === "academic") return "petra";
  if (tone === "professional") return "maya";
  if (tone === "storyteller") return "luna";
  return "clara";
}

function sanitizeRunwayBio(bio: string, characterName?: string) {
  if (!bio?.trim()) return "";

  let text = bio.replace(/\s+/g, " ").trim();
  if (characterName?.trim()) {
    text = text.replace(new RegExp(escapeRegExp(characterName.trim()), "ig"), "");
  }

  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) =>
      cleanSentence(
        sentence
          .replace(/\b(my name is|i am|i'm|this is|you are|named|called)\b[^.!?]*/gi, "")
          .replace(/\bI\b/g, "This character")
      )
    )
    .filter(Boolean)
    .filter((sentence) => !containsLikelyHumanName(sentence));

  return cleanSentence(sentences.slice(0, 3).join(". "));
}

export function isRunwayLiveVoicePreset(value?: string | null): value is RunwayLiveVoicePreset {
  return !!value && RUNWAY_PRESET_SET.has(value);
}

export function inferRunwayLiveVoicePreset(input: {
  voiceId?: string | null;
  voiceName?: string | null;
  tone?: string | null;
  bio?: string | null;
}): RunwayLiveVoicePreset {
  const normalizedVoiceId = input.voiceId?.trim() || "";
  const normalizedVoiceName = normalize(input.voiceName);
  const normalizedTone = normalize(input.tone);
  const bio = normalize(input.bio);
  const genderHint = inferGenderHint(normalizedVoiceName);

  if (normalizedVoiceId && ELEVENLABS_TO_RUNWAY_PRESET[normalizedVoiceId]) {
    return ELEVENLABS_TO_RUNWAY_PRESET[normalizedVoiceId];
  }

  if (normalizedVoiceName && isRunwayLiveVoicePreset(normalizedVoiceName)) {
    return normalizedVoiceName;
  }

  if (normalizedVoiceName.includes("rachel")) return "clara";
  if (normalizedVoiceName.includes("drew")) return "drew";
  if (normalizedVoiceName.includes("sarah")) return "maya";
  if (normalizedVoiceName.includes("charlie")) return "emma";
  if (normalizedVoiceName.includes("charlotte")) return "luna";

  if (genderHint) {
    return presetForGenderAndTone(genderHint, normalizedTone, bio);
  }

  if (bio.includes("creative") || bio.includes("story") || bio.includes("imagin")) return "luna";
  if (bio.includes("energetic") || bio.includes("playful") || bio.includes("upbeat")) return "emma";
  if (bio.includes("thoughtful") || bio.includes("gentle") || bio.includes("calm")) return "maya";
  if (bio.includes("professional") || bio.includes("executive") || bio.includes("technical")) return "adrian";

  return TONE_TO_RUNWAY_PRESET[normalizedTone] || DEFAULT_RUNWAY_LIVE_VOICE_PRESET;
}

export function buildRunwayPersonality(input: {
  name?: string | null;
  bio?: string | null;
  tone?: string | null;
}) {
  const tone = normalize(input.tone) || "friendly";
  const sanitizedBio = sanitizeRunwayBio(input.bio || "", input.name || "");

  const lines = [
    `Adopt a ${tone} conversational style.`,
    sanitizedBio
      ? `Core personality and expertise: ${sanitizedBio}.`
      : "Be concise, clear, and conversational.",
    "Stay grounded in the attached knowledge and current conversation context.",
    "Do not claim any real-world human identity or introduce yourself with a personal name.",
    "If you do not know something, say so directly instead of inventing details.",
  ];

  return lines.join(" ");
}
