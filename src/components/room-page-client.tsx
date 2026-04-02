"use client";

import { useState } from "react";

import { FallbackRoom } from "@/components/fallback-room";
import { RunwayLiveRoom } from "@/components/runway-live-room";

export function RoomPageClient({ character }: { character: any }) {
  const [mode, setMode] = useState<"runway" | "fallback">(
    character?.runwayCharacterId ? "runway" : "fallback"
  );

  if (mode === "runway" && character.runwayCharacterId) {
    return <RunwayLiveRoom character={character} onUseFallback={() => setMode("fallback")} />;
  }

  return (
    <FallbackRoom
      character={character}
      slug={character.slug}
      canReturnToRunwayLive={!!character.runwayCharacterId}
      onReturnToRunwayLive={() => setMode("runway")}
    />
  );
}
