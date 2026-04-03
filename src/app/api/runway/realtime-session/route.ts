import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  cancelRealtimeSession,
  createRealtimeSession,
  getRealtimeSession,
} from "@/services/runwayRealtime";

const DEFAULT_MAX_DURATION = 300;

export const dynamic = "force-dynamic";

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

/**
 * POST — Create a new Runway realtime session.
 *
 * Returns { sessionId } immediately. The CLIENT is responsible for polling
 * GET to wait for READY, then consuming the session via the SDK.
 *
 * This avoids long-running server functions that hit Vercel timeouts.
 */
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

    const sessionOptions: {
      enableClientEvents: boolean;
      personality?: string;
      startScript?: string;
    } = {
      enableClientEvents: clientEventsEnabled,
    };

    if (requestedPersonality) {
      sessionOptions.personality = requestedPersonality;
    }

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

    // Return immediately — client will poll GET for status
    return NextResponse.json({
      sessionId: created.id,
      clientEventsEnabled,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create Runway realtime session" }, { status: 500 });
  }
}

/**
 * GET — Check the status of a Runway realtime session.
 *
 * When the session reaches READY, the response includes `sessionKey`
 * which the client uses with the SDK's `consumeSession()` to get
 * the WebRTC credentials (serverUrl, token, roomName).
 */
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
