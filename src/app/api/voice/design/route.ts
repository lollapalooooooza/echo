import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDesignedVoice, designVoicePreviews } from "@/services/voice";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const generatedVoiceId =
      typeof body?.generatedVoiceId === "string" ? body.generatedVoiceId.trim() : "";

    if (!description) {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }

    if (!generatedVoiceId) {
      const previewSet = await designVoicePreviews(description);
      return NextResponse.json(previewSet);
    }

    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const elevenLabsVoiceId = await createDesignedVoice(name, description, generatedVoiceId);
    const voice = await db.voice.create({
      data: {
        userId: (session.user as any).id,
        name,
        elevenLabsVoiceId,
        isCloned: false,
        isDefault: false,
      },
      select: {
        id: true,
        name: true,
        elevenLabsVoiceId: true,
        isCloned: true,
        isDefault: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ voice });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create designed voice" },
      { status: 400 }
    );
  }
}
