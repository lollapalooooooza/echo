"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { FallbackRoom } from "@/components/fallback-room";
import { RunwayLiveRoom } from "@/components/runway-live-room";

export default function RoomPage({ params }: { params: { slug: string } }) {
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"runway" | "fallback">("fallback");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/characters")
      .then((response) => response.json())
      .then((characters) => {
        if (cancelled) return;
        const current = (Array.isArray(characters) ? characters : []).find((item: any) => item.slug === params.slug) || null;
        setCharacter(current);
        setMode(current?.runwayCharacterId ? "runway" : "fallback");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  if (loading) {
    return (
      <div className="room-backdrop flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (!character) {
    return (
      <div className="room-backdrop flex h-screen items-center justify-center px-6 text-center text-sm text-white/50">
        Character not found.
      </div>
    );
  }

  if (mode === "runway" && character.runwayCharacterId) {
    return <RunwayLiveRoom character={character} onUseFallback={() => setMode("fallback")} />;
  }

  return (
    <FallbackRoom
      character={character}
      slug={params.slug}
      canReturnToRunwayLive={!!character.runwayCharacterId}
      onReturnToRunwayLive={() => setMode("runway")}
    />
  );
}
