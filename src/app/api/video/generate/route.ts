import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateBothVideos, generateIdleVideo, generateSpeakingVideo } from "@/services/video";
import { db } from "@/lib/db";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { characterId, action } = await req.json();
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 });

  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== (session.user as any).id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!character.avatarUrl) return NextResponse.json({ error: "Character needs an avatar first" }, { status: 400 });

  try {
    if (action === "idle") {
      const url = await generateIdleVideo(character.avatarUrl);
      if (url) {
        await db.character.update({ where: { id: characterId }, data: { idleVideoUrl: url } });
        return NextResponse.json({ idleVideoUrl: url, speakingVideoUrl: character.speakingVideoUrl });
      }
      return NextResponse.json({
        idleVideoUrl: character.idleVideoUrl,
        speakingVideoUrl: character.speakingVideoUrl,
        error: "Runway did not return an idle video. Existing video state was preserved.",
      });
    }
    if (action === "speaking") {
      const url = await generateSpeakingVideo(character.avatarUrl);
      if (url) {
        await db.character.update({ where: { id: characterId }, data: { speakingVideoUrl: url } });
        return NextResponse.json({ idleVideoUrl: character.idleVideoUrl, speakingVideoUrl: url });
      }
      return NextResponse.json({
        idleVideoUrl: character.idleVideoUrl,
        speakingVideoUrl: character.speakingVideoUrl,
        error: "Runway did not return a speaking video. Existing video state was preserved.",
      });
    }
    if (action === "both") {
      const { idleVideoUrl, speakingVideoUrl } = await generateBothVideos(character.avatarUrl, character.personalityTone);
      const data: { idleVideoUrl?: string; speakingVideoUrl?: string } = {};

      if (idleVideoUrl) data.idleVideoUrl = idleVideoUrl;
      if (speakingVideoUrl) data.speakingVideoUrl = speakingVideoUrl;

      if (Object.keys(data).length > 0) {
        await db.character.update({ where: { id: characterId }, data });
      }

      return NextResponse.json({
        idleVideoUrl: idleVideoUrl ?? character.idleVideoUrl,
        speakingVideoUrl: speakingVideoUrl ?? character.speakingVideoUrl,
        ...(!idleVideoUrl || !speakingVideoUrl
          ? { error: "Runway only returned part of the video set. Existing video state was preserved for missing outputs." }
          : {}),
      });
    }
    return NextResponse.json({ error: "action must be idle, speaking, or both" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
