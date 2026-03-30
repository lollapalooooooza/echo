import { NextRequest } from "next/server";
import { orchestrateChat } from "@/services/chatOrchestrator";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    characterId,
    message,
    history = [],
    voiceEnabled = true,
    sessionId = "anon",
    conversationId,
  } = body;

  if (!characterId || !message?.trim()) {
    return new Response(JSON.stringify({ error: "characterId and message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const event of orchestrateChat({
          characterId,
          message,
          history: history.slice(-10),
          voiceEnabled,
          sessionId,
          conversationId,
        })) {
          send(event.type, event.data);
        }
      } catch (err: any) {
        console.error("[Chat] Orchestration error:", err);
        send("error", { error: err.message });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
