import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cloneVoice } from "@/services/voice";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const name = String(formData.get("name") || "").trim();
    const file = formData.get("audio");
    if (!name || !(file instanceof File)) {
      return NextResponse.json({ error: "name and audio required" }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const elevenLabsId = await cloneVoice(name, buf, {
      name: file.name,
      contentType: file.type,
      size: file.size,
    });

    const voice = await db.voice.create({
      data: {
        userId: (session.user as any).id,
        name,
        elevenLabsVoiceId: elevenLabsId,
        isCloned: true,
      },
    });
    return NextResponse.json({ voiceId: voice.id, elevenLabsVoiceId: elevenLabsId });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to clone voice" },
      { status: 400 }
    );
  }
}
