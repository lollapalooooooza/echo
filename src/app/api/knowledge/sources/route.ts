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
      id: true, type: true, title: true, sourceUrl: true, fileName: true,
      status: true, chunkCount: true, errorMsg: true, summary: true,
      topic: true, publishDate: true, createdAt: true,
    },
  });
  return NextResponse.json(sources);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceId } = await req.json();
  await db.contentChunk.deleteMany({ where: { sourceId } });
  await db.knowledgeSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ success: true });
}
