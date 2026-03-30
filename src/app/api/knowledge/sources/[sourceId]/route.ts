import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/knowledge/sources/[sourceId] — get single source with chunks
export async function GET(
  req: NextRequest,
  { params }: { params: { sourceId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const source = await db.knowledgeSource.findFirst({
    where: { id: params.sourceId, userId: (session.user as any).id },
    include: {
      chunks: { orderBy: { chunkIndex: "asc" }, select: { id: true, chunkIndex: true, heading: true, content: true, tokenCount: true } },
    },
  });

  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  return NextResponse.json(source);
}

// DELETE /api/knowledge/sources/[sourceId] — delete single source
export async function DELETE(
  req: NextRequest,
  { params }: { params: { sourceId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const source = await db.knowledgeSource.findFirst({
    where: { id: params.sourceId, userId: (session.user as any).id },
  });

  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  await db.knowledgeSource.delete({ where: { id: params.sourceId } });
  return NextResponse.json({ success: true });
}
