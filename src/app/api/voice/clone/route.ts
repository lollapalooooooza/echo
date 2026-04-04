import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cloneVoice } from "@/services/voice";
import { db } from "@/lib/db";

const MIN_DURATION_SECS = 30;
const MAX_DURATION_SECS = 120;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const name = String(formData.get("name") || "").trim();
    const file = formData.get("audio");
    const durationSecs = Number(formData.get("durationSecs") || NaN);
    if (!name || !(file instanceof File)) {
      return NextResponse.json({ error: "name and audio required" }, { status: 400 });
    }

    const contentType = String(file.type || "").trim().toLowerCase();
    const fileName = String(file.name || "").trim().toLowerCase();
    const isMp3 = contentType === "audio/mpeg" || contentType === "audio/mp3" || fileName.endsWith(".mp3");

    if (!isMp3) {
      return NextResponse.json(
        { error: "Please upload an MP3 sample between 30 seconds and 2 minutes." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(durationSecs) || durationSecs < MIN_DURATION_SECS || durationSecs > MAX_DURATION_SECS) {
      return NextResponse.json(
        { error: "Your MP3 sample must be between 30 seconds and 2 minutes." },
        { status: 400 }
      );
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
    return NextResponse.json({ voiceId: voice.id, name: voice.name, elevenLabsVoiceId: elevenLabsId });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to clone voice" },
      { status: 400 }
    );
  }
}
