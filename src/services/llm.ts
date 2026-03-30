import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let _client: Anthropic | null = null;
function client(): Anthropic { if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }); return _client; }

export function buildSystemPrompt(name: string, bio: string, tone: string, sources: { title: string; content: string }[]): string {
  const ctx = sources.map((s, i) => `[Source ${i + 1}: "${s.title}"]\n${s.content}`).join("\n\n---\n\n");
  return `You are "${name}", a knowledge character on Echo.

BIO: ${bio}
TONE: ${tone}

RULES:
1. Answer ONLY from source content below. This is your entire knowledge base.
2. If sources don't cover a topic, say: "That's outside what I've written about. I mainly cover [your topics]."
3. NEVER fabricate facts, quotes, or opinions not in sources.
4. Speak in first person as the creator's knowledge embodied.
5. Keep responses conversational — 2-3 short paragraphs. You're in a live video call.
6. Reference article titles when drawing from a specific source.

KNOWLEDGE:
${ctx || "No relevant sources found for this query."}`;
}

export async function generateCompletion(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const res = await client().messages.create({ model: env.ANTHROPIC_MODEL, max_tokens: 1024, system, messages });
  return res.content.find((b) => b.type === "text")?.text || "";
}

export async function* streamCompletion(system: string, messages: { role: "user" | "assistant"; content: string }[]): AsyncGenerator<string> {
  const stream = client().messages.stream({ model: env.ANTHROPIC_MODEL, max_tokens: 1024, system, messages });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
}
