import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { PRESET_VOICES } from "@/services/voice";
import { listVoices } from "@/services/voiceService";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userVoices = await db.voice.findMany({
    where: {
      userId: (session.user as any).id,
      isDefault: false,
      NOT: {
        id: {
          startsWith: "preset_",
        },
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { characters: true } },
      characters: { select: { id: true, name: true } },
    },
  });

  const providerVoices = await listVoices();
  const providerVoiceById = new Map(
    providerVoices.custom.map((voice: any) => [String(voice.voice_id || ""), voice])
  );

  return NextResponse.json({
    presets: PRESET_VOICES,
    custom: userVoices.map((voice) => {
      const providerVoice = providerVoiceById.get(String(voice.elevenLabsVoiceId || "")) as any;

      return {
        ...voice,
        providerPreviewUrl:
          typeof providerVoice?.preview_url === "string" ? providerVoice.preview_url : null,
        providerStatus: providerVoice ? "READY" : providerVoices.providerAvailable ? "MISSING" : null,
        providerCategory:
          typeof providerVoice?.category === "string" ? providerVoice.category : null,
      };
    }),
  });
}
