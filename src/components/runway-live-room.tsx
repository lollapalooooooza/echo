"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Loader2,
  MessageCircleMore,
  Mic,
  MicOff,
  MonitorUp,
  MoonStar,
  PhoneOff,
  RefreshCw,
  SunMedium,
  Video,
  VideoOff,
} from "lucide-react";
import { isTrackReference } from "@livekit/components-react";
import {
  AvatarSession,
  AvatarVideo,
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

function formatElapsed(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return [hrs, mins, secs].map((value) => String(value).padStart(2, "0")).join(":");
  }

  return [mins, secs].map((value) => String(value).padStart(2, "0")).join(":");
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
        "relative flex h-full min-h-full items-center justify-center overflow-hidden rounded-[32px] border",
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
            ? "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.85),_transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.1),rgba(246,242,234,0.92))]"
            : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_42%),linear-gradient(180deg,rgba(6,8,15,0.12),rgba(6,8,15,0.92))]"
        )}
      />
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),transparent_68%)]" />
      <div className="relative z-10 flex max-w-2xl flex-col items-center px-6 text-center sm:px-10">
        <div
          className={cn(
            "inline-flex items-center gap-3 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] backdrop-blur-xl",
            isLight ? "border-white/85 bg-white/72 text-emerald-700" : "border-white/15 bg-white/8 text-emerald-100/80"
          )}
        >
          <Loader2 className={cn("h-4 w-4 animate-spin", isLight ? "text-emerald-700" : "text-emerald-100/80")} />
          {label}
        </div>
        <h2
          className={cn("mt-6 text-[clamp(2.2rem,5vw,4.25rem)] leading-[0.95] tracking-[-0.04em]", isLight ? "text-slate-900" : "text-white")}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {character.name}
        </h2>
        <p className={cn("mt-5 max-w-xl text-[15px] leading-7 sm:text-base", isLight ? "text-slate-600" : "text-white/68")}>
          {detail}
        </p>
      </div>
    </div>
  );
}

function RunwayAvatarStage({
  avatar,
  character,
  theme,
  onVideoReadyChange,
}: {
  avatar: any;
  character: any;
  theme: RoomTheme;
  onVideoReadyChange: (ready: boolean) => void;
}) {
  const hasVideoTrack = avatar.status === "ready" && isTrackReference(avatar.videoTrackRef);

  useEffect(() => {
    onVideoReadyChange(hasVideoTrack);
  }, [hasVideoTrack, onVideoReadyChange]);

  if (hasVideoTrack) {
    return <VideoTrack trackRef={avatar.videoTrackRef} className="h-full w-full object-cover" />;
  }

  return (
    <CharacterPlaceholder
      character={character}
      label={avatar.status === "connecting" ? "Connecting" : "Preparing video"}
      detail="Runway is bringing the live avatar online so you can talk directly with it in real time."
      theme={theme}
    />
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
  const media = useLocalMedia();
  const isLight = theme === "light";
  const [videoReady, setVideoReady] = useState(false);
  const [overlayTone, setOverlayTone] = useState<"light" | "dark">(isLight ? "dark" : "light");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const avatarStageRef = useRef<HTMLDivElement | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!videoReady) {
      setOverlayTone(isLight ? "dark" : "light");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 28;
    canvas.height = 20;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return;
    }

    const sampleTone = () => {
      const video = avatarStageRef.current?.querySelector("video");
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const sampleHeight = Math.max(4, Math.floor(canvas.height * 0.35));
        const frame = context.getImageData(0, 0, canvas.width, sampleHeight).data;

        let luminanceTotal = 0;
        let pixels = 0;

        for (let index = 0; index < frame.length; index += 4) {
          const alpha = frame[index + 3] / 255;
          if (alpha < 0.2) continue;

          const red = frame[index];
          const green = frame[index + 1];
          const blue = frame[index + 2];
          luminanceTotal += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          pixels += 1;
        }

        if (pixels > 0) {
          setOverlayTone(luminanceTotal / pixels > 158 ? "dark" : "light");
        }
      } catch {
        // Some runtimes may block sampling video frames; keep the fallback tone.
      }
    };

    sampleTone();
    const intervalId = window.setInterval(sampleTone, 1500);
    return () => window.clearInterval(intervalId);
  }, [videoReady, isLight]);

  useEffect(() => {
    if (!videoReady || session.state !== "active") {
      if (session.state !== "active") {
        sessionStartedAtRef.current = null;
        setElapsedSeconds(0);
      }
      return;
    }

    if (sessionStartedAtRef.current === null) {
      sessionStartedAtRef.current = Date.now();
    }

    const tick = () => {
      if (sessionStartedAtRef.current === null) return;
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)));
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [session.state, videoReady]);

  const useDarkText = overlayTone === "dark";
  const overlayTextClass = useDarkText ? "text-slate-950" : "text-white";
  const topGradientClass = useDarkText
    ? "bg-gradient-to-b from-white/42 via-white/10 to-transparent"
    : "bg-gradient-to-b from-black/28 via-black/8 to-transparent";
  const badgeClass = useDarkText
    ? "bg-white/70 text-slate-950"
    : "bg-black/32 text-white";
  const controlIdleClass = useDarkText
    ? "bg-white/58 text-slate-950 hover:bg-white/72"
    : "bg-black/26 text-white hover:bg-black/36";
  const controlActiveClass = useDarkText
    ? "bg-slate-950/86 text-white hover:bg-slate-950"
    : "bg-white/18 text-white hover:bg-white/24";
  const controlInactiveClass = useDarkText
    ? "bg-white/82 text-slate-500 ring-1 ring-slate-300/72 hover:bg-white"
    : "bg-black/34 text-white/55 ring-1 ring-white/12 hover:bg-black/42";
  const controlAlertClass = useDarkText
    ? "bg-amber-50/96 text-amber-700 ring-1 ring-amber-300/85 hover:bg-amber-100"
    : "bg-amber-500/20 text-amber-100 ring-1 ring-amber-300/30 hover:bg-amber-500/28";
  const controlShareClass = useDarkText
    ? "bg-sky-500/92 text-white shadow-[0_6px_18px_rgba(14,165,233,0.32)] hover:bg-sky-500"
    : "bg-sky-500/82 text-white shadow-[0_6px_18px_rgba(14,165,233,0.24)] hover:bg-sky-500/90";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "relative flex min-h-0 flex-1 overflow-hidden rounded-[32px]",
          videoReady
            ? isLight
              ? "bg-white/30 ring-1 ring-black/5"
              : "bg-black/30 ring-1 ring-white/10"
            : "bg-transparent"
        )}
      >
        <div ref={avatarStageRef} className="absolute inset-0">
          <AvatarVideo>
            {(avatar) => (
              <RunwayAvatarStage
                avatar={avatar}
                character={character}
                theme={theme}
                onVideoReadyChange={setVideoReady}
              />
            )}
          </AvatarVideo>
        </div>

        {videoReady && (
          <>
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-10 h-28 backdrop-blur-[14px]",
                topGradientClass
              )}
            />

            <div className="pointer-events-none absolute left-5 top-5 right-24 z-20 sm:left-6 sm:top-6">
              <h2
                className={cn(
                  "max-w-[18rem] text-[clamp(1.2rem,2vw,1.75rem)] leading-[0.96] tracking-[-0.03em]",
                  overlayTextClass,
                  useDarkText
                    ? "drop-shadow-[0_1px_8px_rgba(255,255,255,0.16)]"
                    : "drop-shadow-[0_1px_10px_rgba(0,0,0,0.22)]"
                )}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {character.name}
              </h2>
            </div>

            <div className="pointer-events-none absolute right-5 top-5 z-20 sm:right-6 sm:top-6">
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] shadow-[0_4px_10px_rgba(15,23,42,0.08)] backdrop-blur-xl",
                  badgeClass
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: "radial-gradient(circle at 35% 35%, #ffd5c7 0%, #ff6a3d 42%, #ff4c1f 100%)",
                    boxShadow: "0 0 10px rgba(255,106,61,0.28)",
                  }}
                />
                <span>Live</span>
                <span className={cn("h-3.5 w-px", useDarkText ? "bg-slate-300/80" : "bg-white/24")} />
                <span>{formatElapsed(elapsedSeconds)}</span>
              </div>
            </div>

            <RunwayLiveOverlays
              character={character}
              theme={theme}
              clientEventsEnabled={clientEventsEnabled}
            />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-black/16 via-black/4 to-transparent" />

            <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-6">
              <div className="pointer-events-auto flex flex-wrap justify-center gap-3 sm:gap-4">
                <LiveControlButton
                  onClick={
                    media.micError
                      ? () => void media.retryMic()
                      : media.hasMic
                        ? media.toggleMic
                        : undefined
                  }
                  label={
                    media.micError
                      ? "Retry microphone"
                      : !media.hasMic
                        ? "No microphone detected"
                        : media.isMicEnabled
                          ? "Turn microphone off"
                          : "Turn microphone on"
                  }
                  icon={media.micError || !media.hasMic || !media.isMicEnabled ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  variantClass={
                    media.micError || !media.hasMic
                      ? controlAlertClass
                      : media.isMicEnabled
                        ? controlActiveClass
                        : controlInactiveClass
                  }
                  disabled={!media.hasMic && !media.micError}
                />
                <LiveControlButton
                  onClick={
                    media.cameraError
                      ? () => void media.retryCamera()
                      : media.hasCamera
                        ? media.toggleCamera
                        : undefined
                  }
                  label={
                    media.cameraError
                      ? "Retry camera"
                      : !media.hasCamera
                        ? "No camera detected"
                        : media.isCameraEnabled
                          ? "Turn camera off"
                          : "Turn camera on"
                  }
                  icon={media.cameraError || !media.hasCamera || !media.isCameraEnabled ? <VideoOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                  variantClass={
                    media.cameraError || !media.hasCamera
                      ? controlAlertClass
                      : media.isCameraEnabled
                        ? controlActiveClass
                        : controlInactiveClass
                  }
                  disabled={!media.hasCamera && !media.cameraError}
                />
                <LiveControlButton
                  onClick={media.toggleScreenShare}
                  label={media.isScreenShareEnabled ? "Stop sharing screen" : "Share screen"}
                  icon={<MonitorUp className="h-5 w-5" />}
                  variantClass={media.isScreenShareEnabled ? controlShareClass : controlIdleClass}
                />
                <button
                  onClick={() => void session.end()}
                  aria-label="End live call"
                  title="End live call"
                  className={cn(
                    "inline-flex h-14 w-14 items-center justify-center rounded-full text-white transition-colors backdrop-blur-xl shadow-[0_4px_12px_rgba(15,23,42,0.12)]",
                    theme === "light" ? "bg-[#ff5a36]/96 hover:bg-[#ff4b22]" : "bg-[#ff5a36]/92 hover:bg-[#ff4b22]"
                  )}
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
              </div>
            </div>

            <UserVideo mirror>
              {(user) =>
                user.hasVideo && user.trackRef && isTrackReference(user.trackRef) ? (
                  <div
                    className={cn(
                      "absolute bottom-24 right-5 h-28 w-20 overflow-hidden rounded-[20px] border backdrop-blur-sm sm:bottom-28 sm:right-6",
                      useDarkText
                        ? "border-white/72 bg-white/44 shadow-[0_4px_12px_rgba(15,23,42,0.08)]"
                        : "border-white/16 bg-black/24 shadow-[0_4px_12px_rgba(0,0,0,0.16)]"
                    )}
                  >
                    <VideoTrack trackRef={user.trackRef} className="h-full w-full object-cover" />
                  </div>
                ) : null
              }
            </UserVideo>
          </>
        )}
      </div>
    </div>
  );
}

function LiveControlButton({
  onClick,
  label,
  icon,
  variantClass,
  disabled,
}: {
  onClick?: () => void;
  label: string;
  icon: ReactNode;
  variantClass: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-14 w-14 items-center justify-center rounded-full transition-colors backdrop-blur-xl shadow-[0_4px_12px_rgba(15,23,42,0.12)] disabled:cursor-not-allowed disabled:opacity-55",
        variantClass
      )}
    >
      {icon}
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
  const liveStageShellClass =
    "h-full min-h-0 [&>.lk-room-container]:flex [&>.lk-room-container]:h-full [&>.lk-room-container]:min-h-0 [&>.lk-room-container]:flex-col";
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
    <div className={cn("relative h-[100dvh] overflow-hidden transition-colors duration-500", isLight ? "bg-[#f8f6f1] text-slate-900" : "room-backdrop text-white")}>
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isLight
            ? "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(246,241,233,0.72)_34%,_rgba(232,227,220,0.45)_100%)]"
            : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_rgba(0,0,0,0)_38%)]"
        )}
      />
      <header className="absolute inset-x-0 top-0 z-30 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
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
        </div>
      </header>

      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col px-4 pb-4 pt-[4.75rem] sm:px-6 sm:pb-5 sm:pt-[5rem]">
        <div className="min-w-0 flex-1">
          {connection.status === "ready" ? (
            <div className={liveStageShellClass}>
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
            </div>
          ) : connection.status === "connecting" ? (
            <div className="h-full min-h-0">
              <CharacterPlaceholder
                character={character}
                label="Starting live session"
                detail="We are fetching fresh Runway credentials, warming up the avatar, and getting this room ready for a direct conversation."
                theme={roomTheme}
              />
            </div>
          ) : (
            <div
              className={cn(
                "flex h-full min-h-0 flex-col items-center justify-center rounded-[32px] border px-6 text-center",
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
