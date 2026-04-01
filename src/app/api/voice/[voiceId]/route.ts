import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteClonedVoice } from "@/services/voice";

export async function DELETE(_: NextRequest, { params }: { params: { voiceId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const voice = await db.voice.findFirst({
    where: {
      id: params.voiceId,
      userId: (session.user as any).id,
    },
    include: {
      _count: {
        select: { characters: true },
      },
    },
  });

  if (!voice || !voice.isCloned) {
    return NextResponse.json({ error: "Voice not found" }, { status: 404 });
  }

  if (voice._count.characters > 0) {
    return NextResponse.json(
      { error: "This voice is still assigned to one or more characters." },
      { status: 409 }
    );
  }

  await deleteClonedVoice(voice.elevenLabsVoiceId);

  await db.voice.delete({
    where: { id: voice.id },
  });

  return NextResponse.json({ success: true });
}
