import { NextRequest, NextResponse } from "next/server";
import { synthesize, synthesizeStream } from "@/services/voice";

export async function POST(req: NextRequest) {
  const { voiceId, text, stream } = await req.json();
  if (!voiceId || !text) return NextResponse.json({ error: "voiceId and text required" }, { status: 400 });

  try {
    if (stream) {
      const audioStream = await synthesizeStream(voiceId, text);
      return new Response(audioStream, { headers: { "Content-Type": "audio/mpeg" } });
    }
    const buf = await synthesize(voiceId, text);
    return new Response(buf, { headers: { "Content-Type": "audio/mpeg", "Content-Length": buf.byteLength.toString() } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
