import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRunwayAvatar } from "@/services/runwayAvatar";

export const dynamic = "force-dynamic";

async function getAccessibleCharacter(characterId: string, userId?: string) {
  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character) return null;

  const isOwner = !!userId && character.userId === userId;
  if (!isOwner && character.status !== "PUBLISHED") return null;

  return character;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  const characterId = req.nextUrl.searchParams.get("characterId");
  const avatarId = req.nextUrl.searchParams.get("avatarId");

  if (!characterId && !avatarId) {
    return NextResponse.json({ error: "characterId or avatarId required" }, { status: 400 });
  }

  let resolvedAvatarId = avatarId;
  if (!resolvedAvatarId && characterId) {
    const character = await getAccessibleCharacter(characterId, userId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (!character.runwayCharacterId?.trim()) {
      return NextResponse.json({ error: "Character does not have a Runway avatar configured" }, { status: 400 });
    }
    resolvedAvatarId = character.runwayCharacterId.trim();
  }

  try {
    const avatar = await getRunwayAvatar(resolvedAvatarId!);
    return NextResponse.json({ avatar });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load Runway avatar" }, { status: 500 });
  }
}
