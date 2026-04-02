import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { searchSimilar } from "@/services/embeddings";
import { getLinkedSourceIds } from "@/services/character";
import { generateSpeech } from "@/services/voiceService";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

let anthropicClient: Anthropic | null = null;
function anthropic() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

type CharacterInfo = {
  id: string;
  userId: string;
  name: string;
  bio: string;
  personalityTone: string;
  voiceId: string | null;
  voice: { elevenLabsVoiceId: string } | null;
};

async function loadCharacter(characterId: string): Promise<CharacterInfo | null> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    include: { voice: { select: { elevenLabsVoiceId: true } } },
  });
  if (!character || character.status !== "PUBLISHED") return null;
  return character;
}

async function gatherKnowledge(characterId: string, userId: string, topic: string) {
  const linkedSourceIds = await getLinkedSourceIds(characterId);
  if (linkedSourceIds.length > 0) {
    const { embedText } = await import("@/services/embeddings");
    const queryVec = await embedText(topic);
    const vecStr = `[${queryVec.join(",")}]`;
    const placeholders = linkedSourceIds.map((_, i) => `$${i + 3}`).join(", ");
    const results = await db.$queryRawUnsafe<any[]>(
      `SELECT c.content, s.title as "sourceTitle"
       FROM "ContentChunk" c JOIN "KnowledgeSource" s ON c."sourceId" = s.id
       WHERE s.id IN (${placeholders}) AND s.status = 'INDEXED' AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector LIMIT $2`,
      vecStr,
      4,
      ...linkedSourceIds
    );
    return results;
  }
  return searchSimilar(topic, userId, 4, 0.2);
}

function buildPodcastSystemPrompt(
  character: CharacterInfo,
  otherCharacter: CharacterInfo,
  knowledge: any[],
  topic: string
) {
  const ctx = knowledge
    .map((s, i) => `[Source ${i + 1}: "${s.sourceTitle}"]\n${s.content}`)
    .join("\n\n---\n\n");

  return `You are "${character.name}", having a live podcast-style discussion with "${otherCharacter.name}".

BIO: ${character.bio}
YOUR TONE: ${character.personalityTone}

DISCUSSION TOPIC: ${topic}

RULES:
1. Speak naturally as if in a live podcast conversation — be conversational and engaging.
2. Draw from your knowledge base below to share insights, but speak in your own voice.
3. Respond to what the other speaker said — agree, disagree, build on their points, or offer a new angle.
4. Keep each response to 2-3 sentences. This is a back-and-forth dialogue, not a monologue.
5. Reference specific articles or facts from your knowledge when relevant.
6. Stay in character with your personality tone: ${character.personalityTone}.
7. Never break character or mention you are an AI.

YOUR KNOWLEDGE:
${ctx || "No specific sources found. Speak from general expertise based on your bio."}`;
}

export async function POST(req: NextRequest) {
  const limiter = await rateLimit(req, {
    endpoint: "podcast:session",
    limit: 5,
    windowMs: 60_000,
  });
  if (!limiter.allowed) return rateLimitResponse(limiter.remaining);

  const body = await req.json().catch(() => null);
  const characterIdA = body?.characterIdA;
  const characterIdB = body?.characterIdB;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const history = Array.isArray(body?.history) ? body.history : [];
  const speakerTurn = body?.speakerTurn === "B" ? "B" : "A";

  if (!characterIdA || !characterIdB || !topic) {
    return NextResponse.json(
      { error: "characterIdA, characterIdB, and topic are required" },
      { status: 400 }
    );
  }

  const [charA, charB] = await Promise.all([
    loadCharacter(characterIdA),
    loadCharacter(characterIdB),
  ]);

  if (!charA || !charB) {
    return NextResponse.json({ error: "One or both characters not found" }, { status: 404 });
  }

  const activeChar = speakerTurn === "A" ? charA : charB;
  const otherChar = speakerTurn === "A" ? charB : charA;

  const knowledge = await gatherKnowledge(activeChar.id, activeChar.userId, topic);
  const systemPrompt = buildPodcastSystemPrompt(activeChar, otherChar, knowledge, topic);

  const messages = history.length > 0
    ? history.map((msg: any) => ({
        role: msg.speaker === activeChar.name ? ("assistant" as const) : ("user" as const),
        content: msg.content,
      }))
    : [{ role: "user" as const, content: `Let's discuss: ${topic}. What are your thoughts?` }];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let fullText = "";

        const anthropicStream = anthropic().messages.stream({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 512,
          system: systemPrompt,
          messages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            send("text", { text: event.delta.text, speaker: activeChar.name });
          }
        }

        // Generate voice audio if voice is configured
        const voiceId = activeChar.voice?.elevenLabsVoiceId || activeChar.voiceId;
        if (voiceId && fullText.trim()) {
          try {
            const audioBuffer = await generateSpeech(fullText.trim().slice(0, 2000), voiceId);
            const audioBase64 = Buffer.from(audioBuffer).toString("base64");
            send("audio", { audio: audioBase64, speaker: activeChar.name });
          } catch (err) {
            send("audio_error", { error: "Voice synthesis failed", speaker: activeChar.name });
          }
        }

        send("done", { speaker: activeChar.name });
      } catch (err: any) {
        send("error", { error: err.message || "Podcast generation failed" });
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
