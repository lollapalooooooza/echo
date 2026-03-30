import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resyncAllContent } from "@/services/ingestion";

export const maxDuration = 120;

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await resyncAllContent((session.user as any).id);
  return NextResponse.json(result);
}
