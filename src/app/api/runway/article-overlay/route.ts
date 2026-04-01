import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { selectArticleOverlay } from "@/services/articleOverlay";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function getAccessibleCharacter(characterId: string, userId?: string) {
  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { id: true, userId: true, status: true },
  });

  if (!character) return null;

  const isOwner = !!userId && character.userId === userId;
  if (!isOwner && character.status !== "PUBLISHED") {
    return null;
  }

  return character;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  const limiter = await rateLimit(req, {
    userId,
    endpoint: "runway:article-overlay",
    limit: 24,
    windowMs: 60_000,
  });

  if (!limiter.allowed) {
    return rateLimitResponse(limiter.remaining);
  }

  const body = await req.json().catch(() => null);
  const characterId = typeof body?.characterId === "string" ? body.characterId : "";
  const utterance = typeof body?.utterance === "string" ? body.utterance : "";

  if (!characterId || !utterance.trim()) {
    return NextResponse.json({ error: "characterId and utterance are required" }, { status: 400 });
  }

  const character = await getAccessibleCharacter(characterId, userId);
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  try {
    const result = await selectArticleOverlay(characterId, utterance);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to resolve article overlay" },
      { status: 500 }
    );
  }
}
