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
// buildRunwaySessionPersonality removed — we now let the avatar's own
// config on Runway (voice, personality, etc.) take effect by default.

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

    // Build session options — only include overrides that are explicitly provided.
    // Otherwise let the avatar's own config on Runway (voice, personality, etc.) take effect.
    const sessionOptions: {
      enableClientEvents: boolean;
      personality?: string;
      startScript?: string;
    } = {
      enableClientEvents: clientEventsEnabled,
    };

    // Only override personality if the caller explicitly sent one
    if (requestedPersonality) {
      sessionOptions.personality = requestedPersonality;
    }

    // Only override startScript if the caller explicitly sent one
    if (hasStartScriptOverride && requestedStartScript) {
      sessionOptions.startScript = requestedStartScript;
    }

    let created;

    try {
      created = await createRealtimeSession(
        character.runwayCharacterId.trim(),
        maxDuration,
        sessionOptions
      );
    } catch (error) {
      if (!clientEventsEnabled || !isToolCallingUnavailableError(error)) {
        throw error;
      }

      clientEventsEnabled = false;
      sessionOptions.enableClientEvents = false;
      created = await createRealtimeSession(
        character.runwayCharacterId.trim(),
        maxDuration,
        sessionOptions
      );
    }
    console.log(`[runway-session] Created session ${created.id}, polling for READY…`);

    const deadline = Date.now() + SESSION_READY_TIMEOUT_MS;
    let liveSession: RunwayRealtimeSession | { id: string; status: "NOT_READY" } = {
      id: created.id,
      status: "NOT_READY",
    };
    let lastPollError: string | null = null;
    let consecutivePollErrors = 0;

    let nextPollDelayMs = INITIAL_SESSION_POLL_INTERVAL_MS;

    while (Date.now() < deadline) {
      try {
        liveSession = await getRealtimeSession(created.id);
        consecutivePollErrors = 0;
        lastPollError = null;
      } catch (pollErr: any) {
        consecutivePollErrors++;
        lastPollError = pollErr?.message || String(pollErr);
        console.error(
          `[runway-session] Poll error #${consecutivePollErrors} for ${created.id}:`,
          lastPollError
        );
        // Bail early if the retrieve call is consistently failing
        if (consecutivePollErrors >= 5) {
          return NextResponse.json(
            {
              error: `Runway session polling failed repeatedly: ${lastPollError}`,
              sessionId: created.id,
            },
            { status: 502 }
          );
        }
        liveSession = { id: created.id, status: "NOT_READY" };
      }

      console.log(`[runway-session] ${created.id} status: ${liveSession.status}`);

      if (liveSession.status === "READY") {
        try {
          const credentials = await consumeRealtimeSession(liveSession.id, liveSession.sessionKey);
          return NextResponse.json({
            sessionId: liveSession.id,
            serverUrl: credentials.url,
            token: credentials.token,
            roomName: credentials.roomName,
            clientEventsEnabled,
          });
        } catch (consumeErr: any) {
          console.error(`[runway-session] Consume failed for ${created.id}:`, consumeErr?.message);
          return NextResponse.json(
            {
              error: `Session was ready but consume failed: ${consumeErr?.message || "unknown error"}`,
              sessionId: created.id,
            },
            { status: 502 }
          );
        }
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

      // RUNNING means someone already consumed the session (shouldn't happen
      // in normal flow but handle it gracefully)
      if (liveSession.status === "RUNNING") {
        return NextResponse.json(
          {
            error: "Runway live session was already consumed by another client",
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

    console.error(
      `[runway-session] Timed out for ${created.id}. Last status: ${liveSession.status}, last poll error: ${lastPollError}`
    );

    return NextResponse.json(
      {
        error: "Runway live session timed out while waiting for connection credentials",
        lastStatus: liveSession.status,
        lastPollError,
        sessionId: created.id,
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
