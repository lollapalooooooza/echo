"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Loader2,
  MessageCircleMore,
  Mic,
  MonitorUp,
  PhoneOff,
  RefreshCw,
  Sparkles,
  Video,
} from "lucide-react";
import { isTrackReference } from "@livekit/components-react";
import {
  AvatarSession,
  AvatarVideo,
  ControlBar,
  UserVideo,
  VideoTrack,
  type SessionCredentials,
  useAvatarSession,
} from "@runwayml/avatars-react";

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

function CharacterPlaceholder({ character, label, detail }: { character: any; label: string; detail: string }) {
  return (
    <div className="relative flex h-full min-h-[26rem] items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-neutral-950">
      {character.avatarUrl ? (
        <img src={character.avatarUrl} alt={character.name} className="absolute inset-0 h-full w-full object-cover opacity-25 blur-[2px]" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black" />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_42%),linear-gradient(180deg,rgba(6,8,15,0.12),rgba(6,8,15,0.9))]" />
      <div className="relative z-10 flex max-w-md flex-col items-center px-6 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-white/80" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200/80">{label}</p>
        <p className="mt-3 text-sm leading-relaxed text-white/65">{detail}</p>
      </div>
    </div>
  );
}

function RunwaySessionSurface({ character }: { character: any }) {
  const session = useAvatarSession();

  return (
    <div className="flex h-full min-h-[32rem] flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-emerald-200/70">Runway Live Character</p>
          <h2 className="mt-2 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            {character.name}
          </h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-medium text-emerald-100">
          <span className="live-dot" style={{ width: 6, height: 6 }} />
          {session.state === "active" ? "Live now" : session.state === "connecting" ? "Joining live call" : "Connected"}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-black">
        <AvatarVideo>
          {(avatar) => {
            if (avatar.status === "ready") {
              if (isTrackReference(avatar.videoTrackRef)) {
                return <VideoTrack trackRef={avatar.videoTrackRef} className="h-full w-full object-cover" />;
              }

              return (
                <CharacterPlaceholder
                  character={character}
                  label="Preparing video"
                  detail="Runway is bringing the live avatar online so you can talk directly with it in real time."
                />
              );
            }

            return (
              <CharacterPlaceholder
                character={character}
                label={avatar.status === "connecting" ? "Connecting" : "Preparing video"}
                detail="Runway is bringing the live avatar online so you can talk directly with it in real time."
              />
            );
          }}
        </AvatarVideo>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-5">
          <p className="max-w-xl text-sm leading-relaxed text-white/75">{character.bio}</p>
        </div>

        <UserVideo mirror>
          {(user) =>
            user.hasVideo && user.trackRef && isTrackReference(user.trackRef) ? (
              <div className="absolute bottom-4 right-4 h-28 w-20 overflow-hidden rounded-2xl border border-white/15 bg-black/60 shadow-2xl shadow-black/30 backdrop-blur-sm">
                <VideoTrack trackRef={user.trackRef} className="h-full w-full object-cover" />
              </div>
            ) : null
          }
        </UserVideo>
      </div>

      <ControlBar showScreenShare>
        {(controls) => (
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <LiveControlButton active={controls.isMicEnabled} onClick={controls.toggleMic} label={controls.isMicEnabled ? "Mic on" : "Mic off"} icon={<Mic className="h-4 w-4" />} />
            <LiveControlButton active={controls.isCameraEnabled} onClick={controls.toggleCamera} label={controls.isCameraEnabled ? "Camera on" : "Camera off"} icon={<Camera className="h-4 w-4" />} />
            <LiveControlButton active={controls.isScreenShareEnabled} onClick={controls.toggleScreenShare} label={controls.isScreenShareEnabled ? "Sharing screen" : "Share screen"} icon={<MonitorUp className="h-4 w-4" />} />
            <button
              onClick={() => void controls.endCall()}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-red-500/85 px-5 text-sm font-medium text-white transition-colors hover:bg-red-500"
            >
              <PhoneOff className="h-4 w-4" />
              End live call
            </button>
          </div>
        )}
      </ControlBar>
    </div>
  );
}

function LiveControlButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
        active ? "bg-white/12 text-white hover:bg-white/18" : "bg-white/5 text-white/55 hover:bg-white/10"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function RunwayLiveRoom({
  character,
  onUseFallback,
}: {
  character: any;
  onUseFallback?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>({ status: "connecting" });

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setConnection({ status: "connecting" });

      try {
        const response = await fetch("/api/runway/realtime-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: character.id }),
        });
        const data = await readResponse(response);
        if (!response.ok) throw new Error(data.error || "Failed to start Runway live session");

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
        if (!cancelled) {
          setConnection({
            status: "error",
            error: error.message || "Failed to start Runway live session",
          });
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
    };
  }, [attempt, character.id]);

  const canRetry = connection.status === "error" || connection.status === "ended";

  return (
    <div className="room-backdrop min-h-screen text-white">
      <header className="z-10 flex items-center justify-between px-5 py-4">
        <Link href="/lobby" className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80">
          <ArrowLeft className="h-4 w-4" />
          Leave
        </Link>
        <div className="flex items-center gap-2">
          {onUseFallback && (
            <button
              onClick={onUseFallback}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/10"
            >
              <MessageCircleMore className="h-3.5 w-3.5" />
              Use fallback chat
            </button>
          )}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-medium text-emerald-100">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            Default live session
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 pb-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          {connection.status === "ready" ? (
            <AvatarSession
              key={`${character.id}:${attempt}`}
              credentials={connection.credentials}
              audio
              video
              onEnd={() => setConnection({ status: "ended" })}
              onError={(error) => setConnection({ status: "error", error: error.message || "Runway live session ended unexpectedly" })}
            >
              <RunwaySessionSurface character={character} />
            </AvatarSession>
          ) : connection.status === "connecting" ? (
            <CharacterPlaceholder
              character={character}
              label="Starting live session"
              detail="This room now opens straight into the Runway live avatar call. Give it a moment while we fetch fresh connection credentials."
            />
          ) : (
            <div className="flex min-h-[32rem] flex-col items-center justify-center rounded-[28px] border border-white/10 bg-black/50 px-6 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-red-300/20 bg-red-300/10">
                {connection.status === "ended" ? <PhoneOff className="h-6 w-6 text-red-100" /> : <AlertCircle className="h-6 w-6 text-red-100" />}
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-100/85">
                {connection.status === "ended" ? "Live call ended" : "Runway live unavailable"}
              </p>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65">
                {connection.status === "ended"
                  ? "The Runway live session has ended. You can start a fresh session right away."
                  : connection.error}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {canRetry && (
                  <button
                    onClick={() => setAttempt((current) => current + 1)}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-medium text-white transition-colors hover:bg-white/15"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry live session
                  </button>
                )}
                {onUseFallback && (
                  <button
                    onClick={onUseFallback}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10"
                  >
                    <Video className="h-4 w-4" />
                    Open fallback chat
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="w-full space-y-4 lg:max-w-sm">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-100/75">
              <Sparkles className="h-3.5 w-3.5" />
              Live conversation
            </div>
            <h3 className="mt-3 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Talk to the real Runway character first
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              This room now prioritizes the live Runway avatar instead of the older looping video or static portrait. If Runway is unavailable, you can still open fallback chat manually.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/45">Opening line</p>
            <p className="mt-3 text-sm leading-relaxed text-white/75">{character.greeting}</p>
          </div>

          {(character.suggestedQuestions || []).length > 0 && (
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/45">Try asking</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(character.suggestedQuestions || []).slice(0, 6).map((question: string, index: number) => (
                  <div key={index} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] leading-relaxed text-white/70">
                    {question}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/45">Browser tips</p>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-white/65">
              <li>Allow microphone access when your browser asks so the avatar can hear you.</li>
              <li>Camera is optional, but turning it on gives you a fuller two-way live session.</li>
              <li>If the live session fails, retry once before dropping to fallback chat.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
