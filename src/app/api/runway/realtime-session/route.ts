import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  cancelRealtimeSession,
  consumeRealtimeSession,
  createRealtimeSession,
  getRealtimeSession,
  type RunwayRealtimeSession,
} from "@/services/runwayRealtime";
import { buildRunwaySessionPersonality } from "@/services/runwayVoice";

const DEFAULT_MAX_DURATION = 300;
const SESSION_READY_TIMEOUT_MS = 30_000;
const INITIAL_SESSION_POLL_INTERVAL_MS = 100;
const MAX_SESSION_POLL_INTERVAL_MS = 350;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function clampMaxDuration(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MAX_DURATION;
  return Math.min(Math.max(Math.round(numeric), 60), 900);
}

async function getAccessibleCharacter(characterId: string, userId?: string) {
  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character) return null;

  const isOwner = !!userId && character.userId === userId;
  if (!isOwner && character.status !== "PUBLISHED") return null;

  return character;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isToolCallingUnavailableError(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as any).message || "")
        : "";

  return /tool calling is coming soon for all organizations/i.test(message);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  const limiter = await rateLimit(req, {
    userId,
    endpoint: "runway:realtime-session:create",
    limit: 3,
    windowMs: 60_000,
  });

  if (!limiter.allowed) return rateLimitResponse(limiter.remaining);

  const body = await req.json().catch(() => null);
  const characterId = body?.characterId;

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  const character = await getAccessibleCharacter(characterId, userId);
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }
  if (!character.runwayCharacterId?.trim()) {
    return NextResponse.json({ error: "Character does not have a Runway Avatar ID configured" }, { status: 400 });
  }

  try {
    const maxDuration = clampMaxDuration(body?.maxDuration);
    const requestedClientEvents = body?.enableClientEvents === true;
    const requestedPersonality = readOptionalString(body?.sessionPersonality);
    const hasStartScriptOverride = typeof body?.startScript === "string";
    const requestedStartScript = hasStartScriptOverride ? readOptionalString(body?.startScript) : "";
    let clientEventsEnabled = requestedClientEvents;

    const buildSessionPersonality = (enableArticleTool: boolean) =>
      requestedPersonality ||
      buildRunwaySessionPersonality({
        name: character.name,
        bio: character.bio,
        tone: character.personalityTone,
        enableArticleTool,
      });

    let created;

    try {
      created = await createRealtimeSession(character.runwayCharacterId.trim(), maxDuration, {
        enableClientEvents: clientEventsEnabled,
        personality: buildSessionPersonality(clientEventsEnabled),
        startScript: hasStartScriptOverride
          ? requestedStartScript || undefined
          : character.greeting?.trim() || undefined,
      });
    } catch (error) {
      if (!clientEventsEnabled || !isToolCallingUnavailableError(error)) {
        throw error;
      }

      clientEventsEnabled = false;
      created = await createRealtimeSession(character.runwayCharacterId.trim(), maxDuration, {
        enableClientEvents: false,
        personality: buildSessionPersonality(false),
        startScript: hasStartScriptOverride
          ? requestedStartScript || undefined
          : character.greeting?.trim() || undefined,
      });
    }
    const deadline = Date.now() + SESSION_READY_TIMEOUT_MS;
    let liveSession: RunwayRealtimeSession | { id: string; status: "NOT_READY" } = {
      id: created.id,
      status: "NOT_READY",
    };

    let nextPollDelayMs = INITIAL_SESSION_POLL_INTERVAL_MS;

    while (Date.now() < deadline) {
      try {
        liveSession = await getRealtimeSession(created.id);
      } catch {
        liveSession = { id: created.id, status: "NOT_READY" };
      }

      if (liveSession.status === "READY") {
        const credentials = await consumeRealtimeSession(liveSession.id, liveSession.sessionKey);
        return NextResponse.json({
          sessionId: liveSession.id,
          serverUrl: credentials.url,
          token: credentials.token,
          roomName: credentials.roomName,
          clientEventsEnabled,
        });
      }

      if (liveSession.status === "FAILED") {
        return NextResponse.json(
          {
            error: liveSession.failure || "Runway live session failed to start",
            session: liveSession,
          },
          { status: 409 }
        );
      }

      if (liveSession.status === "CANCELLED" || liveSession.status === "COMPLETED") {
        return NextResponse.json(
          {
            error: `Runway live session ${liveSession.status.toLowerCase()} before it could connect`,
            session: liveSession,
          },
          { status: 409 }
        );
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;

      await wait(Math.min(nextPollDelayMs, remainingMs));
      nextPollDelayMs = Math.min(Math.round(nextPollDelayMs * 1.6), MAX_SESSION_POLL_INTERVAL_MS);
    }

    return NextResponse.json(
      {
        error: "Runway live session timed out while waiting for connection credentials",
        session: liveSession,
      },
      { status: 504 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create Runway realtime session" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const session = await getRealtimeSession(sessionId);
    return NextResponse.json({ session });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load Runway realtime session" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    await cancelRealtimeSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to cancel Runway realtime session" }, { status: 500 });
  }
}
