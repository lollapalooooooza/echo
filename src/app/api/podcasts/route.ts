import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const characterSelect = {
  id: true,
  name: true,
  slug: true,
  avatarUrl: true,
  bio: true,
  personalityTone: true,
  runwayCharacterId: true,
  user: { select: { name: true, image: true } },
};

// GET /api/podcasts — list published podcasts for the lobby
export async function GET() {
  const podcasts = await (db as any).publishedPodcast.findMany({
    where: { status: "PUBLISHED" },
    include: {
      characterA: { select: characterSelect },
      characterB: { select: characterSelect },
      user: { select: { name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(podcasts);
}

// POST /api/podcasts — publish a new podcast
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const body = await req.json().catch(() => null);

  const characterAId = body?.characterAId;
  const characterBId = body?.characterBId;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!characterAId || !characterBId) {
    return NextResponse.json({ error: "Two character IDs are required" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  // Verify both characters exist and are published
  const [charA, charB] = await Promise.all([
    db.character.findUnique({ where: { id: characterAId } }),
    db.character.findUnique({ where: { id: characterBId } }),
  ]);

  if (!charA || !charB) {
    return NextResponse.json({ error: "One or both characters not found" }, { status: 404 });
  }

  if (charA.status !== "PUBLISHED" || charB.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Both characters must be published" }, { status: 400 });
  }

  const podcast = await (db as any).publishedPodcast.create({
    data: {
      userId,
      characterAId,
      characterBId,
      topic,
      description: description || null,
      status: "PUBLISHED",
    },
    include: {
      characterA: { select: characterSelect },
      characterB: { select: characterSelect },
      user: { select: { name: true, image: true } },
    },
  });

  return NextResponse.json(podcast, { status: 201 });
}

// DELETE /api/podcasts — unpublish/delete a podcast
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const podcast = await (db as any).publishedPodcast.findUnique({ where: { id } });

  if (!podcast) {
    return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
  }

  if (podcast.userId !== userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await (db as any).publishedPodcast.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
