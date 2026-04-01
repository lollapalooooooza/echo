import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const sources = await (db.knowledgeSource as any).findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, title: true, folderName: true, sourceUrl: true, fileName: true,
      status: true, chunkCount: true, errorMsg: true, summary: true,
      topic: true, publishDate: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json(sources);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json().catch(() => ({}));
  const sourceIds = Array.isArray(body?.sourceIds)
    ? body.sourceIds.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
    : typeof body?.sourceId === "string" && body.sourceId.trim().length > 0
      ? [body.sourceId.trim()]
      : [];
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const folderName = typeof body?.folderName === "string" ? body.folderName.trim() : "";

  if (sourceIds.length === 0) {
    return NextResponse.json({ error: "sourceId or sourceIds required" }, { status: 400 });
  }

  const ownedSources = await db.knowledgeSource.findMany({
    where: { id: { in: sourceIds }, userId },
    select: { id: true },
  });

  if (ownedSources.length !== sourceIds.length) {
    return NextResponse.json({ error: "Some sources were not found" }, { status: 404 });
  }

  if (sourceIds.length === 1 && title) {
    const updated = await db.knowledgeSource.update({
      where: { id: sourceIds[0] },
      data: { title },
      select: {
        id: true,
        title: true,
        folderName: true,
      },
    });
    return NextResponse.json({ success: true, source: updated });
  }

  if (folderName || body?.folderName === "") {
    await db.knowledgeSource.updateMany({
      where: { id: { in: sourceIds }, userId },
      data: { folderName: folderName || null },
    });
    return NextResponse.json({ success: true, updated: sourceIds.length, folderName: folderName || null });
  }

  return NextResponse.json({ error: "title or folderName required" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json().catch(() => ({}));
  const sourceIds = Array.isArray(body?.sourceIds)
    ? body.sourceIds.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
    : typeof body?.sourceId === "string" && body.sourceId.trim().length > 0
      ? [body.sourceId.trim()]
      : [];

  if (sourceIds.length === 0) {
    return NextResponse.json({ error: "sourceId or sourceIds required" }, { status: 400 });
  }

  const ownedSources = await db.knowledgeSource.findMany({
    where: { id: { in: sourceIds }, userId },
    select: { id: true },
  });

  if (ownedSources.length !== sourceIds.length) {
    return NextResponse.json({ error: "Some sources were not found" }, { status: 404 });
  }

  await db.knowledgeSource.deleteMany({
    where: { id: { in: sourceIds }, userId },
  });

  return NextResponse.json({ success: true, deleted: sourceIds.length });
}
