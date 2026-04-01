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
  MoonStar,
  PhoneOff,
  RefreshCw,
  SunMedium,
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
  useLocalMedia,
  useAvatarSession,
} from "@runwayml/avatars-react";

import { cn } from "@/lib/utils";
import { RunwayLiveOverlays } from "@/components/runway-live-overlays";

type RoomTheme = "light" | "dark";
const ROOM_THEME_STORAGE_KEY = "echonest-room-theme";

type ConnectionState =
  | { status: "connecting" }
  | { status: "ready"; credentials: SessionCredentials; clientEventsEnabled: boolean }
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

function CharacterPlaceholder({
  character,
  label,
  detail,
  theme,
}: {
  character: any;
  label: string;
  detail: string;
  theme: RoomTheme;
}) {
  const isLight = theme === "light";
  return (
    <div
      className={cn(
        "relative flex h-full min-h-[26rem] items-center justify-center overflow-hidden rounded-[28px] border",
        isLight ? "border-white/70 bg-[#f6f2ea]" : "border-white/10 bg-neutral-950"
      )}
    >
      {character.avatarUrl ? (
        <img src={character.avatarUrl} alt={character.name} className="absolute inset-0 h-full w-full object-cover opacity-25 blur-[2px]" />
      ) : (
        <div className={cn("absolute inset-0 bg-gradient-to-br", isLight ? "from-white via-[#f6f2ea] to-[#ece5d7]" : "from-neutral-900 via-neutral-950 to-black")} />
      )}
      <div
        className={cn(
          "absolute inset-0",
          isLight
            ? "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.72),_transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(246,242,234,0.9))]"
            : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_42%),linear-gradient(180deg,rgba(6,8,15,0.12),rgba(6,8,15,0.9))]"
        )}
      />
      <div className="relative z-10 flex max-w-md flex-col items-center px-6 text-center">
        <div
          className={cn(
            "mb-5 flex h-16 w-16 items-center justify-center rounded-full border backdrop-blur-sm",
            isLight ? "border-white/80 bg-white/70" : "border-white/15 bg-white/10"
          )}
        >
          <Loader2 className={cn("h-6 w-6 animate-spin", isLight ? "text-slate-700" : "text-white/80")} />
        </div>
        <p className={cn("text-sm font-semibold uppercase tracking-[0.22em]", isLight ? "text-emerald-700" : "text-emerald-200/80")}>{label}</p>
        <p className={cn("mt-3 text-sm leading-relaxed", isLight ? "text-slate-600" : "text-white/65")}>{detail}</p>
      </div>
    </div>
  );
}

function LiveMicBanner({ theme }: { theme: RoomTheme }) {
  const { hasMic, isMicEnabled, micError, retryMic } = useLocalMedia();
  const isLight = theme === "light";

  if (!micError && hasMic && isMicEnabled) {
    return null;
  }

  const message = micError
    ? "Microphone access failed. Close other apps using your mic or re-allow browser permission, then retry."
    : !hasMic
      ? "No microphone was detected for this session."
      : "Your microphone is off, so the live character cannot hear you yet.";

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
        isLight
          ? "border-amber-200 bg-amber-50/90 text-amber-900"
          : "border-amber-300/20 bg-amber-300/10 text-amber-50"
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p className="max-w-2xl leading-6">{message}</p>
      </div>
      {micError && (
        <button
          type="button"
          onClick={() => void retryMic()}
          className={cn(
            "inline-flex h-9 items-center rounded-full px-4 text-xs font-medium transition-colors",
            isLight ? "bg-white text-amber-900 hover:bg-amber-100" : "bg-white/10 text-white hover:bg-white/15"
          )}
        >
          Retry mic
        </button>
      )}
    </div>
  );
}

function RunwaySessionSurface({
  character,
  theme,
  clientEventsEnabled,
}: {
  character: any;
  theme: RoomTheme;
  clientEventsEnabled: boolean;
}) {
  const session = useAvatarSession();
  const isLight = theme === "light";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={cn("text-[11px] font-medium uppercase tracking-[0.24em]", isLight ? "text-emerald-700/80" : "text-emerald-200/70")}>
            Runway Live Character
          </p>
          <h2 className={cn("mt-2 text-2xl font-semibold", isLight ? "text-slate-900" : "text-white")} style={{ fontFamily: "var(--font-display)" }}>
            {character.name}
          </h2>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium",
            isLight
              ? "bg-emerald-500/12 text-emerald-700"
              : "border border-emerald-300/15 bg-emerald-300/10 text-emerald-100"
          )}
        >
          <span className="live-dot" style={{ width: 6, height: 6 }} />
          {session.state === "active" ? "Live now" : session.state === "connecting" ? "Joining live call" : "Connected"}
        </div>
      </div>

      <LiveMicBanner theme={theme} />

      <div
        className={cn(
          "relative flex min-h-[20rem] flex-1 overflow-hidden rounded-[28px] border md:min-h-[24rem] lg:min-h-0",
          isLight ? "border-white/70 bg-white/60" : "border-white/10 bg-black"
        )}
      >
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
                  theme={theme}
                />
              );
            }

            return (
              <CharacterPlaceholder
                character={character}
                label={avatar.status === "connecting" ? "Connecting" : "Preparing video"}
                detail="Runway is bringing the live avatar online so you can talk directly with it in real time."
                theme={theme}
              />
            );
          }}
        </AvatarVideo>

        <RunwayLiveOverlays
          character={character}
          theme={theme}
          clientEventsEnabled={clientEventsEnabled}
        />

        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 p-5",
            isLight ? "bg-gradient-to-t from-[#f6f2ea] via-[#f6f2ea]/75 to-transparent" : "bg-gradient-to-t from-black/75 via-black/35 to-transparent"
          )}
        >
          <p className={cn("max-w-xl text-sm leading-relaxed", isLight ? "text-slate-600" : "text-white/75")}>{character.bio}</p>
        </div>

        <UserVideo mirror>
          {(user) =>
            user.hasVideo && user.trackRef && isTrackReference(user.trackRef) ? (
              <div
                className={cn(
                  "absolute bottom-4 right-4 h-28 w-20 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-sm",
                  isLight ? "border-white/80 bg-white/70 shadow-slate-300/50" : "border-white/15 bg-black/60 shadow-black/30"
                )}
              >
                <VideoTrack trackRef={user.trackRef} className="h-full w-full object-cover" />
              </div>
            ) : null
          }
        </UserVideo>
      </div>

      <div className="mt-4 shrink-0">
        <ControlBar showScreenShare>
          {(controls) => (
            <div className="flex flex-wrap justify-center gap-3">
              <LiveControlButton active={controls.isMicEnabled} onClick={controls.toggleMic} label={controls.isMicEnabled ? "Mic on" : "Mic off"} icon={<Mic className="h-4 w-4" />} theme={theme} />
              <LiveControlButton active={controls.isCameraEnabled} onClick={controls.toggleCamera} label={controls.isCameraEnabled ? "Camera on" : "Camera off"} icon={<Camera className="h-4 w-4" />} theme={theme} />
              <LiveControlButton active={controls.isScreenShareEnabled} onClick={controls.toggleScreenShare} label={controls.isScreenShareEnabled ? "Sharing screen" : "Share screen"} icon={<MonitorUp className="h-4 w-4" />} theme={theme} />
              <button
                onClick={() => void controls.endCall()}
                className={cn(
                  "inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-white transition-colors",
                  theme === "light" ? "bg-rose-500 hover:bg-rose-600" : "bg-red-500/85 hover:bg-red-500"
                )}
              >
                <PhoneOff className="h-4 w-4" />
                End live call
              </button>
            </div>
          )}
        </ControlBar>
      </div>
    </div>
  );
}

function LiveControlButton({
  active,
  onClick,
  label,
  icon,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
  theme: RoomTheme;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
        theme === "light"
          ? active
            ? "bg-slate-900 text-white hover:bg-slate-700"
            : "bg-white text-slate-700 hover:bg-slate-100"
          : active
            ? "bg-white/12 text-white hover:bg-white/18"
            : "bg-white/5 text-white/55 hover:bg-white/10"
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
  const [roomTheme, setRoomTheme] = useState<RoomTheme>("light");
  const isLight = roomTheme === "light";

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ROOM_THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        setRoomTheme(stored);
      }
    } catch {
      /* ignore storage failures */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ROOM_THEME_STORAGE_KEY, roomTheme);
    } catch {
      /* ignore storage failures */
    }
  }, [roomTheme]);

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
          clientEventsEnabled: data.clientEventsEnabled !== false,
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
    <div className={cn("relative min-h-[100dvh] transition-colors duration-500", isLight ? "bg-[#f8f6f1] text-slate-900" : "room-backdrop text-white")}>
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isLight
            ? "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(246,241,233,0.72)_34%,_rgba(232,227,220,0.45)_100%)]"
            : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_rgba(0,0,0,0)_38%)]"
        )}
      />
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/lobby"
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors",
            isLight ? "bg-white/80 text-slate-600 hover:text-slate-900" : "bg-white/10 text-white/50 hover:text-white/80"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Leave
        </Link>
        <div className="flex items-center gap-2">
          {onUseFallback && (
            <button
              onClick={onUseFallback}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors",
                isLight
                  ? "bg-slate-900 text-white hover:bg-slate-700"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              )}
            >
              <MessageCircleMore className="h-3.5 w-3.5" />
              Use fallback chat
            </button>
          )}

          <button
            onClick={() => setRoomTheme((current) => (current === "light" ? "dark" : "light"))}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              isLight ? "bg-white/80 text-slate-600 hover:text-slate-900" : "bg-white/10 text-white/60 hover:text-white"
            )}
            aria-label="Toggle room theme"
          >
            {isLight ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-7xl min-h-[calc(100dvh-5.5rem)] flex-col px-5 pb-6 sm:px-6 lg:pb-8">
        <div className="min-w-0 flex-1">
          {connection.status === "ready" ? (
            <AvatarSession
              key={`${character.id}:${attempt}`}
              credentials={connection.credentials}
              audio
              video={false}
              onEnd={() => setConnection({ status: "ended" })}
              onError={(error) => setConnection({ status: "error", error: error.message || "Runway live session ended unexpectedly" })}
            >
              <RunwaySessionSurface
                character={character}
                theme={roomTheme}
                clientEventsEnabled={connection.clientEventsEnabled}
              />
            </AvatarSession>
          ) : connection.status === "connecting" ? (
            <CharacterPlaceholder
              character={character}
              label="Starting live session"
              detail="This room now opens straight into the Runway live avatar call. Give it a moment while we fetch fresh connection credentials."
              theme={roomTheme}
            />
          ) : (
            <div
              className={cn(
                "flex min-h-[32rem] flex-col items-center justify-center rounded-[28px] border px-6 text-center",
                isLight ? "border-white/70 bg-white/58" : "border-white/10 bg-black/50"
              )}
            >
              <div
                className={cn(
                  "mb-5 flex h-16 w-16 items-center justify-center rounded-full border",
                  isLight ? "border-red-200 bg-red-50" : "border-red-300/20 bg-red-300/10"
                )}
              >
                {connection.status === "ended" ? (
                  <PhoneOff className={cn("h-6 w-6", isLight ? "text-red-600" : "text-red-100")} />
                ) : (
                  <AlertCircle className={cn("h-6 w-6", isLight ? "text-red-600" : "text-red-100")} />
                )}
              </div>
              <p className={cn("text-sm font-semibold uppercase tracking-[0.22em]", isLight ? "text-red-600" : "text-red-100/85")}>
                {connection.status === "ended" ? "Live call ended" : "Runway live unavailable"}
              </p>
              <p className={cn("mt-3 max-w-lg text-sm leading-relaxed", isLight ? "text-slate-600" : "text-white/65")}>
                {connection.status === "ended"
                  ? "The Runway live session has ended. You can start a fresh session right away."
                  : connection.error}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {canRetry && (
                  <button
                    onClick={() => setAttempt((current) => current + 1)}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors",
                      isLight ? "bg-slate-900 text-white hover:bg-slate-700" : "bg-white/10 text-white hover:bg-white/15"
                    )}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry live session
                  </button>
                )}
                {onUseFallback && (
                  <button
                    onClick={onUseFallback}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors",
                      isLight
                        ? "bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                        : "border border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
                    )}
                  >
                    <Video className="h-4 w-4" />
                    Open fallback chat
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
