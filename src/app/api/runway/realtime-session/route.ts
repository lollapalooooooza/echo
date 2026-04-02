import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getRunwayAvatar } from "@/services/runwayAvatar";
import {
  cancelRealtimeSession,
  consumeRealtimeSession,
  createRealtimeSession,
  getRealtimeSession,
  type RunwayRealtimeSession,
} from "@/services/runwayRealtime";

const DEFAULT_MAX_DURATION = 300;
const SESSION_READY_TIMEOUT_MS = 30_000;
const SESSION_POLL_INTERVAL_MS = 1_000;

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
    // Starting a session should not mutate the avatar itself. Older custom-voice
    // avatars may lack webcam support, but rewriting them here can leave the
    // session connected yet unusable.
    const avatar = await getRunwayAvatar(character.runwayCharacterId.trim());
    const visualInputEnabled = avatar.voice?.type === "runway-live-preset";
    if (avatar.status !== "READY") {
      return NextResponse.json(
        {
          error: `Runway avatar is ${avatar.status.toLowerCase()} and cannot start a live session yet`,
          avatar,
        },
        { status: 409 }
      );
    }

    const maxDuration = clampMaxDuration(body?.maxDuration);
    let clientEventsEnabled = avatar.voice?.type === "runway-live-preset";
    let created;

    try {
      created = await createRealtimeSession(
        character.runwayCharacterId.trim(),
        maxDuration,
        {
          enableClientEvents: clientEventsEnabled,
        }
      );
    } catch (error) {
      if (!clientEventsEnabled || !isToolCallingUnavailableError(error)) {
        throw error;
      }

      clientEventsEnabled = false;
      created = await createRealtimeSession(
        character.runwayCharacterId.trim(),
        maxDuration,
        {
          enableClientEvents: false,
        }
      );
    }
    const deadline = Date.now() + SESSION_READY_TIMEOUT_MS;
    let liveSession: RunwayRealtimeSession | { id: string; status: "NOT_READY" } = {
      id: created.id,
      status: "NOT_READY",
    };

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
          visualInputEnabled,
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

      await wait(SESSION_POLL_INTERVAL_MS);
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
