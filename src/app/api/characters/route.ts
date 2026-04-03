import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCharacter, updateCharacter } from "@/services/character";

// GET /api/characters — list published characters (lobby) or user's characters
export async function GET(req: NextRequest) {
  const mine = req.nextUrl.searchParams.get("mine") === "true";

  if (mine) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const characters = await db.character.findMany({
      where: { userId: (session.user as any).id },
      include: {
        voice: true,
        knowledgeSources: { include: { source: { select: { id: true, title: true, type: true, status: true, topic: true } } } } as any,
        _count: { select: { conversations: true } },
      } as any,
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(characters);
  }

  // Public lobby
  const characters = await db.character.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true, name: true, slug: true, avatarUrl: true, bio: true,
      personalityTone: true, status: true, suggestedQuestions: true,
      greeting: true, runwayCharacterId: true, idleVideoUrl: true,
      speakingVideoUrl: true,
      voice: { select: { elevenLabsVoiceId: true } },
      user: { select: { name: true, image: true } },
      _count: { select: { conversations: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(characters);
}

// POST /api/characters — create new character
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json();
    const character = await createCharacter({
      userId,
      name: body.name,
      bio: body.bio,
      greeting: body.greeting,
      personalityTone: body.personalityTone,
      avatarUrl: body.avatarUrl,
      voiceId: body.voiceId,
      voiceName: body.voiceName,
      runwayCharacterId: body.runwayCharacterId,
      runwayVoicePreset: body.runwayVoicePreset,
      knowledgeSourceIds: body.knowledgeSourceIds,
      suggestedQuestions: body.suggestedQuestions,
      publish: body.publish,
      allowedDomains: body.allowedDomains,
      widgetTheme: body.widgetTheme,
      widgetPosition: body.widgetPosition,
    });
    return NextResponse.json(character, { status: 201 });
  } catch (err: any) {
    const status = err.message?.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

// PUT /api/characters — update character
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const result = await updateCharacter(body.id, userId, {
      name: body.name,
      bio: body.bio,
      greeting: body.greeting,
      personalityTone: body.personalityTone,
      avatarUrl: body.avatarUrl,
      voiceId: body.voiceId,
      voiceName: body.voiceName,
      runwayCharacterId: body.runwayCharacterId,
      knowledgeSourceIds: body.knowledgeSourceIds,
      suggestedQuestions: body.suggestedQuestions,
      publish: body.status === "PUBLISHED",
      allowedDomains: body.allowedDomains,
      widgetTheme: body.widgetTheme,
      widgetPosition: body.widgetPosition,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}

// DELETE /api/characters — delete character
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json().catch(() => ({}));
  const characterId = typeof body?.id === "string" ? body.id : req.nextUrl.searchParams.get("id");

  if (!characterId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { id: true, userId: true },
  });

  if (!character || character.userId !== userId) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  await db.character.delete({ where: { id: characterId } });
  return NextResponse.json({ success: true });
}
