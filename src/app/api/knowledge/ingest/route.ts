import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ingestUrl, ingestText, ingestWebsiteWithProgress } from "@/services/ingestion";

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
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of ingestWebsiteWithProgress(body.url, userId, { maxPages: 20 })) {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            }
          } catch (err: any) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  type: "error",
                  error: err.message,
                  blocked: err.message?.includes("blocked access"),
                })}\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }
    return NextResponse.json({ error: "type must be url, text, or website" }, { status: 400 });
  } catch (err: any) {
    console.error("[Ingest API] Error:", err.message);
    const status =
      /limited to 200,000 characters|too large to ingest/i.test(err.message || "")
        ? 400
        : 500;
    return NextResponse.json({
      error: err.message,
      blocked: err.message?.includes("blocked access"),
    }, { status });
  }
}
