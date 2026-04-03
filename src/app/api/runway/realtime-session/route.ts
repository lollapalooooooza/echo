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
} from "@/services/runwayRealtime";

const DEFAULT_MAX_DURATION = 300;

/**
 * Quick server-side poll window (ms). Keep well under Vercel's 10 s
 * Hobby default so we never get killed mid-response. On Pro plans
 * maxDuration = 60 gives us more room, but we stay conservative here
 * so the function always responds.
 */
const SERVER_POLL_BUDGET_MS = 8_000;
const SERVER_POLL_INTERVAL_MS = 500;

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Pro plan: up to 60 s; Hobby: capped at 10 s

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

/**
 * POST — Create a new Runway realtime session.
 *
 * Hybrid approach following the official SDK pattern:
 * 1. Creates the session on Runway
 * 2. Polls for READY for up to ~8 s server-side
 * 3. If READY in time → consumes and returns full WebRTC credentials
 * 4. If not → returns { sessionId } so the client can continue polling
 *
 * maxDuration = 60 extends the budget on Pro plan. On Hobby (10 s cap)
 * the poll budget is 8 s which is still safe.
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

    // Quick server-side poll — try to reach READY before we respond.
    // If the session is ready in time we return full credentials so the
    // client can skip its own polling. If not, we return just the
    // sessionId and let the client continue polling GET.
    const pollDeadline = Date.now() + SERVER_POLL_BUDGET_MS;

    while (Date.now() < pollDeadline) {
      await wait(SERVER_POLL_INTERVAL_MS);

      try {
        const session = await getRealtimeSession(created.id);

        if (session.status === "READY") {
          // Consume server-side and return WebRTC credentials directly
          try {
            const credentials = await consumeRealtimeSession(
              session.id,
              session.sessionKey
            );
            return NextResponse.json({
              sessionId: session.id,
              serverUrl: credentials.url,
              token: credentials.token,
              roomName: credentials.roomName,
              clientEventsEnabled,
            });
          } catch (consumeErr: any) {
            // Consume failed — let the client try via SDK
            console.warn("[runway-session] Server consume failed:", consumeErr.message);
            return NextResponse.json({
              sessionId: session.id,
              sessionKey: session.sessionKey,
              clientEventsEnabled,
            });
          }
        }

        if (session.status === "FAILED") {
          return NextResponse.json(
            { error: session.failure || "Runway session failed to start" },
            { status: 409 }
          );
        }

        if (session.status === "CANCELLED" || session.status === "COMPLETED") {
          return NextResponse.json(
            { error: `Runway session ${session.status.toLowerCase()} before connection` },
            { status: 409 }
          );
        }

        // NOT_READY — keep polling
      } catch {
        // Transient poll error — keep trying
      }
    }

    // Timed out server-side — return sessionId for client-side polling
    console.log(`[runway-session] ${created.id} still NOT_READY after ${SERVER_POLL_BUDGET_MS}ms, handing to client`);
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
