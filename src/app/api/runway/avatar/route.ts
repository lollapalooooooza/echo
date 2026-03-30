import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRunwayAvatar, getRunwayAvatar } from "@/services/runwayAvatar";
import { getLinkedSourceIds } from "@/services/character";
import { syncRunwayKnowledgeToAvatar } from "@/services/runwayKnowledge";

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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const characterId = body?.characterId as string | undefined;
  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  if (!character.avatarUrl?.trim()) {
    return NextResponse.json({ error: "Upload a character image before generating a Runway avatar" }, { status: 400 });
  }

  try {
    const avatar = await createRunwayAvatar({
      name: character.name,
      bio: character.bio,
      greeting: character.greeting,
      personalityTone: character.personalityTone,
      avatarUrl: character.avatarUrl.trim(),
    });

    const runwayCharacterId = (avatar as any)?.id as string | undefined;
    if (!runwayCharacterId) {
      throw new Error("Runway did not return an avatar ID");
    }

    await db.character.update({
      where: { id: character.id },
      data: {
        runwayCharacterId,
        runwaySessionId: null,
      },
    });

    const linkedSourceIds = await getLinkedSourceIds(character.id);
    await syncRunwayKnowledgeToAvatar(runwayCharacterId, character.userId, linkedSourceIds);
    const refreshedAvatar = await getRunwayAvatar(runwayCharacterId);

    return NextResponse.json({ avatar: refreshedAvatar, runwayCharacterId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to generate Runway avatar" }, { status: 500 });
  }
}
