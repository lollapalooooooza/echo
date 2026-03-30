-- ──────────────────────────────────────────────────────────────
-- Echo Database Migration
-- Run this against your Supabase database if tables don't exist
-- ──────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── NextAuth Models ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT,
  "email" TEXT,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");

CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- ── Knowledge Layer ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "SourceType" AS ENUM ('URL', 'UPLOAD', 'TEXT', 'WEBSITE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SourceStatus" AS ENUM ('PENDING', 'CRAWLING', 'PROCESSING', 'INDEXED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "KnowledgeSource" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "type" "SourceType" NOT NULL,
  "title" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "fileName" TEXT,
  "rawContent" TEXT,
  "cleanedText" TEXT,
  "summary" TEXT,
  "status" "SourceStatus" NOT NULL DEFAULT 'PENDING',
  "errorMsg" TEXT,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "publishDate" TIMESTAMP(3),
  "headings" JSONB,
  "topic" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "KnowledgeSource_userId_status_idx" ON "KnowledgeSource"("userId", "status");

CREATE TABLE IF NOT EXISTS "ContentChunk" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "sourceId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "heading" TEXT,
  "tokenCount" INTEGER NOT NULL DEFAULT 0,
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ContentChunk_sourceId_idx" ON "ContentChunk"("sourceId");

-- ── Voice Layer ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Voice" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "elevenLabsVoiceId" TEXT NOT NULL,
  "isCloned" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Voice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Voice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Voice_userId_idx" ON "Voice"("userId");

-- ── Character ───────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CharacterStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'OFFLINE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Character" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "bio" TEXT NOT NULL,
  "greeting" TEXT NOT NULL,
  "personalityTone" TEXT NOT NULL DEFAULT 'friendly',
  "voiceId" TEXT,
  "runwayCharacterId" TEXT,
  "runwaySessionId" TEXT,
  "idleVideoUrl" TEXT,
  "speakingVideoUrl" TEXT,
  "status" "CharacterStatus" NOT NULL DEFAULT 'DRAFT',
  "suggestedQuestions" JSONB,
  "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "widgetTheme" TEXT NOT NULL DEFAULT 'light',
  "widgetPosition" TEXT NOT NULL DEFAULT 'bottom-right',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Character_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Character_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Character_slug_key" ON "Character"("slug");
CREATE INDEX IF NOT EXISTS "Character_userId_idx" ON "Character"("userId");
CREATE INDEX IF NOT EXISTS "Character_status_idx" ON "Character"("status");

-- ── Conversations ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "characterId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Conversation_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Conversation_characterId_idx" ON "Conversation"("characterId");
CREATE INDEX IF NOT EXISTS "Conversation_sessionId_idx" ON "Conversation"("sessionId");

DO $$ BEGIN
  CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "conversationId" TEXT NOT NULL,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "sourcesJson" JSONB,
  "audioGenerated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");

-- ── Analytics ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AnalyticsDaily" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "characterId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "conversations" INTEGER NOT NULL DEFAULT 0,
  "messages" INTEGER NOT NULL DEFAULT 0,
  "unansweredCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnalyticsDaily_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsDaily_characterId_date_key" ON "AnalyticsDaily"("characterId", "date");
CREATE INDEX IF NOT EXISTS "AnalyticsDaily_characterId_idx" ON "AnalyticsDaily"("characterId");

-- ── Character Knowledge Sources (join table) ────────────────

CREATE TABLE IF NOT EXISTS "CharacterKnowledgeSource" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "characterId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CharacterKnowledgeSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CharacterKnowledgeSource_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterKnowledgeSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CharacterKnowledgeSource_characterId_sourceId_key" ON "CharacterKnowledgeSource"("characterId", "sourceId");
CREATE INDEX IF NOT EXISTS "CharacterKnowledgeSource_characterId_idx" ON "CharacterKnowledgeSource"("characterId");
CREATE INDEX IF NOT EXISTS "CharacterKnowledgeSource_sourceId_idx" ON "CharacterKnowledgeSource"("sourceId");

-- ── Rate Limiting ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "UsageRecord" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT,
  "sessionId" TEXT,
  "endpoint" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UsageRecord_userId_endpoint_timestamp_idx" ON "UsageRecord"("userId", "endpoint", "timestamp");
CREATE INDEX IF NOT EXISTS "UsageRecord_sessionId_endpoint_timestamp_idx" ON "UsageRecord"("sessionId", "endpoint", "timestamp");

-- ── Add missing columns to existing tables (safe to re-run) ──

DO $$ BEGIN
  ALTER TABLE "KnowledgeSource" ADD COLUMN IF NOT EXISTS "publishDate" TIMESTAMP(3);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeSource" ADD COLUMN IF NOT EXISTS "headings" JSONB;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeSource" ADD COLUMN IF NOT EXISTS "topic" TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "runwaySessionId" TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Done!
SELECT 'Migration complete!' as status;
