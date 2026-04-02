"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  MessageCircleMore,
  Radio,
  RefreshCw,
  Volume2,
} from "lucide-react";
import { isTrackReference, useRoomContext } from "@livekit/components-react";
import {
  AvatarSession,
  AvatarVideo,
  VideoTrack,
  type SessionCredentials,
} from "@runwayml/avatars-react";
import { RoomEvent } from "livekit-client";

import { cn } from "@/lib/utils";

type ConnectionState =
  | { status: "connecting" }
  | { status: "ready"; credentials: SessionCredentials }
  | { status: "error"; error: string }
  | { status: "ended" };

async function readResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return {
    error:
      text
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200) || `Request failed with status ${response.status}`,
  };
}

function LiveCharacterPlaceholder({
  character,
  label,
  detail,
}: {
  character: any;
  label: string;
  detail: string;
}) {
  return (
    <div className="relative flex h-full min-h-[21rem] items-center justify-center overflow-hidden rounded-[28px] border border-white/80 bg-[#f5efe3]">
      {character.avatarUrl ? (
        <img
          src={character.avatarUrl}
          alt={character.name}
          className="absolute inset-0 h-full w-full object-cover opacity-25 blur-[2px]"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#ffffff,#f5efe3_58%,#e9dfd0_100%)]" />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.92),_transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.18),rgba(245,239,227,0.92))]" />
      <div className="relative z-10 flex max-w-md flex-col items-center px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/76 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700 backdrop-blur-xl">
          <Loader2 className="h-4 w-4 animate-spin" />
          {label}
        </div>
        <h3
          className="mt-5 text-[clamp(1.7rem,3.2vw,2.6rem)] font-semibold tracking-[-0.04em] text-slate-900"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {character.name}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
      </div>
    </div>
  );
}

function PodcastRunwayVideoSurface({ character }: { character: any }) {
  const room = useRoomContext();
  const [canPlaybackAudio, setCanPlaybackAudio] = useState(true);

  useEffect(() => {
    const syncAudioPlayback = () => {
      setCanPlaybackAudio(room.canPlaybackAudio);
    };

    syncAudioPlayback();
    room.on(RoomEvent.AudioPlaybackStatusChanged, syncAudioPlayback);
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, syncAudioPlayback);
    };
  }, [room]);

  async function enableAudio() {
    try {
      await room.startAudio();
      setCanPlaybackAudio(true);
    } catch {
      // The button stays visible if playback remains blocked.
    }
  }

  return (
    <div className="relative h-full min-h-[21rem] overflow-hidden rounded-[28px]">
      <AvatarVideo>
        {(avatar) => {
          const hasVideoTrack =
            avatar.status === "ready" && isTrackReference(avatar.videoTrackRef);

          if (hasVideoTrack) {
            return (
              <VideoTrack
                trackRef={avatar.videoTrackRef}
                className="h-full w-full object-cover"
              />
            );
          }

          return (
            <LiveCharacterPlaceholder
              character={character}
              label={avatar.status === "connecting" ? "Connecting" : "Preparing"}
              detail="Runway is warming this live host so the podcast stage is ready when you need it."
            />
          );
        }}
      </AvatarVideo>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
        <div className="rounded-full bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 shadow-sm backdrop-blur-xl">
          Runway Live
        </div>
        <div className="rounded-full bg-slate-950/78 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-xl">
          {character.name}
        </div>
      </div>

      {!canPlaybackAudio && (
        <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
          <button
            type="button"
            onClick={() => void enableAudio()}
            className="inline-flex items-center gap-2 rounded-full bg-white/88 px-4 py-2 text-[12px] font-medium text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-colors hover:bg-white"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Enable live audio
          </button>
        </div>
      )}
    </div>
  );
}

function PodcastRunwayCard({ character }: { character: any }) {
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>(
    character?.runwayCharacterId ? { status: "connecting" } : { status: "error", error: "No linked Runway avatar" }
  );

  useEffect(() => {
    if (!character?.runwayCharacterId) {
      setConnection({
        status: "error",
        error: "This character does not have a linked Runway avatar yet.",
      });
      return;
    }

    let cancelled = false;

    async function connect() {
      setConnection({ status: "connecting" });

      try {
        const response = await fetch("/api/runway/realtime-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            maxDuration: 900,
          }),
        });
        const data = await readResponse(response);
        if (!response.ok) {
          throw new Error(data.error || "Failed to start Runway live session");
        }

        if (!data.sessionId || !data.serverUrl || !data.token || !data.roomName) {
          throw new Error("Runway did not return valid live session credentials");
        }

        if (cancelled) return;

        setConnection({
          status: "ready",
          credentials: {
            sessionId: data.sessionId,
            serverUrl: data.serverUrl,
            token: data.token,
            roomName: data.roomName,
          },
        });
      } catch (error: any) {
        if (cancelled) return;
        setConnection({
          status: "error",
          error: error.message || "Failed to start Runway live session",
        });
      }
    }

    void connect();

    return () => {
      cancelled = true;
    };
  }, [attempt, character?.id, character?.runwayCharacterId]);

  return (
    <section className="flex min-h-[30rem] flex-col rounded-[32px] border border-white/80 bg-white/82 p-3 shadow-[0_28px_90px_-60px_rgba(245,158,11,0.45)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-2 pb-3 pt-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-2xl border border-amber-200/70 bg-amber-50">
            {character.avatarUrl ? (
              <img
                src={character.avatarUrl}
                alt={character.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-amber-700">
                {character.name?.[0]}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p
              className="truncate text-lg font-semibold tracking-tight text-slate-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {character.name}
            </p>
            <p className="truncate text-[12px] font-medium capitalize text-slate-500">
              {character.personalityTone}
            </p>
          </div>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Live
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {connection.status === "ready" ? (
          <AvatarSession
            key={`${character.id}:${attempt}`}
            credentials={connection.credentials}
            audio={false}
            video={false}
            onEnd={() => setConnection({ status: "ended" })}
            onError={(error) =>
              setConnection({
                status: "error",
                error:
                  error.message || "Runway live session ended unexpectedly",
              })
            }
          >
            <PodcastRunwayVideoSurface character={character} />
          </AvatarSession>
        ) : connection.status === "connecting" ? (
          <LiveCharacterPlaceholder
            character={character}
            label="Starting session"
            detail="Fetching fresh Runway credentials and bringing this character onto the podcast stage."
          />
        ) : (
          <div className="flex h-full min-h-[21rem] flex-col items-center justify-center rounded-[28px] border border-dashed border-amber-200 bg-[#fbf8f1] px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Radio className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
              {connection.status === "ended" ? "Session ended" : "Live unavailable"}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
              {connection.status === "ended"
                ? "This Runway host finished its current session. Start a fresh one when you are ready."
                : connection.error}
            </p>
            <button
              type="button"
              onClick={() => setAttempt((current) => current + 1)}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
              Retry live session
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export function PodcastRunwayStage({
  charA,
  charB,
  topic,
  onTopicChange,
  onUseFallback,
}: {
  charA: any;
  charB: any;
  topic: string;
  onTopicChange: (value: string) => void;
  onUseFallback?: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 pb-6 pt-6">
      <div className="mb-6 rounded-[32px] border border-white/80 bg-white/84 p-5 shadow-[0_28px_90px_-60px_rgba(245,158,11,0.45)] backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              <Radio className="h-3.5 w-3.5" />
              Default host mode
            </div>
            <h1
              className="mt-4 text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-[-0.04em] text-slate-950"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {charA.name} and {charB.name}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-[15px]">
              Runway live sessions are the default podcast host layer now. Keep both characters warm here, then switch to the chat box fallback whenever you want the automated back-and-forth transcript on a specific topic.
            </p>
          </div>

          <div className="w-full max-w-xl">
            <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.16em] text-slate-500">
              Discussion topic
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={topic}
                onChange={(event) => onTopicChange(event.target.value)}
                placeholder="e.g. The future of AI in education..."
                className="h-12 w-full rounded-2xl border border-neutral-300 bg-white px-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-orange-400"
              />
              {onUseFallback && (
                <button
                  type="button"
                  onClick={onUseFallback}
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
                >
                  <MessageCircleMore className="h-4 w-4" />
                  Open Chat Box
                </button>
              )}
            </div>
            <p className="mt-2 text-[12px] leading-5 text-slate-500">
              The topic is kept here so you can jump into the fallback chat box without retyping it.
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem_minmax(0,1fr)]">
        <PodcastRunwayCard character={charA} />

        <aside className="flex flex-col justify-between rounded-[32px] border border-amber-200/70 bg-[linear-gradient(160deg,#fff7e2_0%,#fffdf7_58%,#ffffff_100%)] p-5 shadow-[0_28px_90px_-60px_rgba(245,158,11,0.42)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/86 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 shadow-sm">
              <Volume2 className="h-3.5 w-3.5" />
              Podcast shell
            </div>
            <h2
              className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Live first, chat as backup
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              This stage keeps both linked Runway avatars online in a light-weight layout that matches the rest of EchoNest. The chat box remains available as the fallback if you want the text-and-audio podcast generator.
            </p>
          </div>

          <div className="mt-6 rounded-[28px] border border-white/90 bg-white/80 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Current topic
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {topic.trim() || "No topic set yet. Add one above so the chat box fallback is ready when you switch."}
            </p>
          </div>
        </aside>

        <PodcastRunwayCard character={charB} />
      </div>
    </div>
  );
}
