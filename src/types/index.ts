// ── Enums ─────────────────────────────────────────────────────
export type SourceType = "URL" | "UPLOAD" | "TEXT" | "WEBSITE";
export type SourceStatus = "PENDING" | "CRAWLING" | "PROCESSING" | "INDEXED" | "ERROR";
export type CharacterStatus = "DRAFT" | "PUBLISHED" | "OFFLINE";
export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";

// ── Knowledge ─────────────────────────────────────────────────
export interface KnowledgeSource {
  id: string;
  userId: string;
  type: SourceType;
  title: string;
  sourceUrl?: string | null;
  fileName?: string | null;
  summary?: string | null;
  status: SourceStatus;
  errorMsg?: string | null;
  chunkCount: number;
  publishDate?: string | null;
  topic?: string | null;
  headings?: any;
  createdAt: string;
  updatedAt: string;
}

export interface ContentChunk {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  heading?: string | null;
  tokenCount: number;
}

// ── Source Citation (returned during chat) ─────────────────────
export interface SourceCitation {
  sourceId: string;
  sourceTitle: string;
  sourceUrl?: string | null;
  score: number;
  excerpt?: string;
  chunkId?: string;
  heading?: string | null;
}

// ── Article Reference Block (for UI) ──────────────────────────
export interface ArticleReference {
  sourceId: string;
  title: string;
  url?: string | null;
  excerpt: string;
  publishDate?: string | null;
  topic?: string | null;
  chunks: { chunkId: string; heading?: string | null; score: number }[];
}

// ── Character ─────────────────────────────────────────────────
export interface CharacterConfig {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string | null;
  bio: string;
  greeting: string;
  personalityTone: string;
  voiceId?: string | null;
  runwayCharacterId?: string | null;
  runwaySessionId?: string | null;
  idleVideoUrl?: string | null;
  speakingVideoUrl?: string | null;
  status: CharacterStatus;
  suggestedQuestions?: string[];
  knowledgeSourceIds?: string[];
}

// ── Voice ─────────────────────────────────────────────────────
export interface VoiceConfig {
  voiceId: string;
  name: string;
  elevenLabsVoiceId: string;
  isCloned: boolean;
  settings?: {
    stability: number;
    similarityBoost: number;
    style: number;
    useSpeakerBoost: boolean;
  };
}

// ── Chat ──────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  articleRefs?: ArticleReference[];
  audioBase64?: string;
  streaming?: boolean;
  timestamp?: string;
}

export interface ChatRequest {
  characterId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  voiceEnabled?: boolean;
  sessionId?: string;
  conversationId?: string;
}

// ── Scraping ──────────────────────────────────────────────────
export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  markdown: string;
  publishDate?: string | null;
  headings: { level: number; text: string }[];
  wordCount: number;
  fetchMethod: "scrapling_stealth" | "scrapling_dynamic" | "scrapling_basic" | "firecrawl" | "native";
}

export interface ScrapeOptions {
  mode: "basic" | "stealth" | "dynamic";
  timeout?: number;
  extractMainContent?: boolean;
  convertToMarkdown?: boolean;
}

// ── Runway Character ──────────────────────────────────────────
export interface RunwayCharacterConfig {
  characterId: string;
  runwayCharacterId?: string;
  runwaySessionId?: string;
  avatarUrl: string;
  voicePreset?: string;
  personalityInstructions?: string;
}

export interface RunwaySessionInfo {
  id: string;
  status: "NOT_READY" | "READY" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  sessionKey?: string;
  expiresAt?: string;
  duration?: number;
  failure?: string;
}
