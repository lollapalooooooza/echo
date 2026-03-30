// GET /api/widget/[characterId] — returns character data for the embeddable widget
// This is called by the iframe embed to load character configuration.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { characterId: string } }) {
  const character = await db.character.findUnique({
    where: { id: params.characterId },
    include: { voice: { select: { elevenLabsVoiceId: true } } },
  });

  if (!character || character.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  // Check domain allowlist
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  if (character.allowedDomains.length > 0) {
    const allowed = character.allowedDomains.some((d) => origin.includes(d));
    if (!allowed) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }
  }

  return NextResponse.json({
    id: character.id,
    name: character.name,
    avatarUrl: character.avatarUrl,
    bio: character.bio,
    greeting: character.greeting,
    suggestedQuestions: character.suggestedQuestions,
    voiceId: character.voice?.elevenLabsVoiceId,
    theme: character.widgetTheme,
    position: character.widgetPosition,
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
