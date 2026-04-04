/**
 * GET /api/user/api-credits
 *
 * Returns the caller's current API credit status.
 *
 * Response shape:
 * {
 *   mode: "free" | "own" | "blocked"
 *   secondsRemaining: number        // Infinity for own-key users if fetch fails
 *   creditBalance: number | null    // raw Runway credit balance (own-key only)
 *   userNumber: number              // 1-based registration rank
 *   hasKey: boolean
 *   freeTierEligible: boolean       // userNumber <= FREE_TIER_LIMIT
 * }
 *
 * Credit formula (Runway): 2 credits = 6 seconds → 1 credit = 3 seconds
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import RunwayML from "@runwayml/sdk";

export const runtime = "nodejs";

const FREE_MINUTES = 5;
const FREE_SECONDS = FREE_MINUTES * 60; // 300
const FREE_TIER_LIMIT = 60;             // first N users get free quota
const CREDITS_PER_SECOND = 2 / 6;      // 2 credits = 6 s → ~0.333 credits/s
const SECONDS_PER_CREDIT = 3;          // inverse: 1 credit = 3 s

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      runwayApiKey: true,
      freeSecondsUsed: true,
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Determine registration rank (1-based)
  const userNumber = await db.user.count({
    where: { createdAt: { lte: user.createdAt } },
  });

  const freeTierEligible = userNumber <= FREE_TIER_LIMIT;
  const hasKey = !!user.runwayApiKey;

  // ── Own key path ──────────────────────────────────────────────
  if (hasKey) {
    try {
      const client = new RunwayML({ apiKey: user.runwayApiKey! });
      const org = await client.organization.retrieve();
      const secondsRemaining = Math.floor(org.creditBalance * SECONDS_PER_CREDIT);
      return NextResponse.json({
        mode: "own",
        secondsRemaining,
        creditBalance: org.creditBalance,
        userNumber,
        hasKey: true,
        freeTierEligible,
      });
    } catch {
      // Key is invalid or network error — fall through to show blocked
      return NextResponse.json({
        mode: "own",
        secondsRemaining: 0,
        creditBalance: null,
        userNumber,
        hasKey: true,
        freeTierEligible,
        keyError: true,
      });
    }
  }

  // ── Free tier path ────────────────────────────────────────────
  if (freeTierEligible) {
    const secondsRemaining = Math.max(0, FREE_SECONDS - user.freeSecondsUsed);
    return NextResponse.json({
      mode: "free",
      secondsRemaining,
      creditBalance: null,
      userNumber,
      hasKey: false,
      freeTierEligible: true,
    });
  }

  // ── Blocked (user > 60 and no own key) ───────────────────────
  return NextResponse.json({
    mode: "blocked",
    secondsRemaining: 0,
    creditBalance: null,
    userNumber,
    hasKey: false,
    freeTierEligible: false,
  });
}
