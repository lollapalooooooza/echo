import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { PRESET_VOICES } from "@/services/voice";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userVoices = await db.voice.findMany({
    where: { userId: (session.user as any).id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { characters: true } },
      characters: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ presets: PRESET_VOICES, custom: userVoices });
}
