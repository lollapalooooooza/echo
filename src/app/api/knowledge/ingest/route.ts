import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ingestUrl, ingestText, ingestWebsite } from "@/services/ingestion";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const body = await req.json();

  try {
    if (body.type === "url") {
      const sourceId = await ingestUrl(body.url, userId);
      return NextResponse.json({ success: true, sourceId });
    }
    if (body.type === "text") {
      const sourceId = await ingestText(body.title, body.text, userId);
      return NextResponse.json({ success: true, sourceId });
    }
    if (body.type === "website") {
      const result = await ingestWebsite(body.url, userId);
      return NextResponse.json({ success: true, ...result });
    }
    return NextResponse.json({ error: "type must be url, text, or website" }, { status: 400 });
  } catch (err: any) {
    console.error("[Ingest API] Error:", err.message);
    return NextResponse.json({
      error: err.message,
      blocked: err.message?.includes("blocked access"),
    }, { status: 500 });
  }
}
