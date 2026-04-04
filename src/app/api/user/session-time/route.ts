/**
 * POST /api/user/session-time  { seconds: number }
 *
 * Records elapsed Runway live-session time against the user's free quota.
 * Only applies when the user is on the free tier (no own API key).
 * Ignored for own-key users (their credits are tracked by Runway directly).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const FREE_SECONDS = 300;
const FREE_TIER_LIMIT = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const body = await req.json();
  const seconds = typeof body.seconds === "number" ? Math.max(0, Math.floor(body.seconds)) : 0;
  if (seconds === 0) return NextResponse.json({ ok: true });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, createdAt: true, runwayApiKey: true, freeSecondsUsed: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Own-key users: don't touch our DB counter
  if (user.runwayApiKey) return NextResponse.json({ ok: true });

  // Only deduct for free-tier-eligible users
  const userNumber = await db.user.count({ where: { createdAt: { lte: user.createdAt } } });
  if (userNumber > FREE_TIER_LIMIT) return NextResponse.json({ ok: true });

  const newUsed = Math.min(FREE_SECONDS, user.freeSecondsUsed + seconds);
  await db.user.update({ where: { id: userId }, data: { freeSecondsUsed: newUsed } });

  return NextResponse.json({
    ok: true,
    freeSecondsUsed: newUsed,
    secondsRemaining: Math.max(0, FREE_SECONDS - newUsed),
  });
}
