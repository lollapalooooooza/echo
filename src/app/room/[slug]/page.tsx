import { notFound } from "next/navigation";

import { RoomPageClient } from "@/components/room-page-client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: { slug: string } }) {
  const character = await db.character.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      avatarUrl: true,
      bio: true,
      personalityTone: true,
      status: true,
      suggestedQuestions: true,
      greeting: true,
      runwayCharacterId: true,
      idleVideoUrl: true,
      speakingVideoUrl: true,
      voice: { select: { elevenLabsVoiceId: true } },
      user: { select: { name: true, image: true } },
      _count: { select: { conversations: true } },
    },
  });

  if (!character || character.status !== "PUBLISHED") {
    notFound();
  }

  return <RoomPageClient character={character} />;
}
