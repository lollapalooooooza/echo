"use client";

/**
 * Podcast Runway Stage
 *
 * Runs two Runway avatar sessions side-by-side.
 * Avatar A's speech audio is piped as mic input to Room B, and vice versa,
 * using the Web Audio API as a bridge.
 *
 * Key design: we publish a persistent bridge track (from a
 * MediaStreamAudioDestinationNode) to each room immediately on connect.
 * When the other avatar's audio arrives, we route it through the bridge
 * so the already-published track carries the audio.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, RefreshCw, Radio } from "lucide-react";
import {
  AvatarSession,
  AvatarVideo,
  VideoTrack,
  useAvatar,
  useAvatarSession,
  type SessionCredentials,
} from "@runwayml/avatars-react";
import { isTrackReference, useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track, type Room } from "livekit-client";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function truncatePromptText(value: string, maxLength = 420) {
  const normalized = compactText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildPodcastPersonality(
  character: any,
  partnerName: string,
  topic: string
) {
  const speakerName = character?.name?.trim() || "the current speaker";
  const otherSpeaker = partnerName.trim() || "the other host";
  const bio = compactText(character?.bio || "");
  const tone =
    compactText(character?.personalityTone || "") || "conversational";
  const discussionTopic =
    compactText(topic) ||
    `${speakerName} and ${otherSpeaker} are having a live podcast discussion.`;

  return truncatePromptText(
    [
      `You are ${speakerName} in a live podcast conversation with ${otherSpeaker}.`,
      bio ? `Stay grounded in this profile: ${bio}.` : null,
      `Keep your speaking style ${tone}, natural, and concise.`,
      `The discussion topic is: ${discussionTopic}.`,
      `Every time you hear new speech, treat it as ${otherSpeaker} speaking directly to you on the live stage.`,
      `Listen carefully to what ${otherSpeaker} just said, then answer directly in two or three spoken sentences.`,
      `Do not monologue. Do not repeat the other speaker verbatim. Stop speaking after each turn so ${otherSpeaker} can respond.`,
      "Do not wait for extra instructions after hearing the other host. Reply naturally as soon as they finish.",
    ]
      .filter(Boolean)
      .join(" "),
    760
  );
}

async function readResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return {
    error:
      text
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220) || `Request failed with status ${response.status}`,
  };
}

type ConnectionState =
  | { status: "connecting" }
  | { status: "ready"; credentials: SessionCredentials }
  | { status: "error"; error: string }
  | { status: "ended" };

type HostId = "A" | "B";

/* ------------------------------------------------------------------ */
/*  Audio Bridge                                                      */
/*  Pipes avatar A's speech → room B's mic, and vice versa.           */
/*                                                                    */
/*  IMPORTANT: must be created inside a user-gesture (click handler)  */
/*  so the AudioContext starts in "running" state.                    */
/* ------------------------------------------------------------------ */

class PodcastAudioBridge {
  private ctx: AudioContext;
  /** Destination whose output track is published to room A (carries B's voice) */
  private destA: MediaStreamAudioDestinationNode;
  /** Destination whose output track is published to room B (carries A's voice) */
  private destB: MediaStreamAudioDestinationNode;
  private srcA: MediaStreamAudioSourceNode | null = null;
  private srcB: MediaStreamAudioSourceNode | null = null;
  private destroyed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.destA = this.ctx.createMediaStreamDestination();
    this.destB = this.ctx.createMediaStreamDestination();
  }

  /** Feed avatar A's speech into the bridge (goes to room B) */
  setAvatarATrack(track: MediaStreamTrack) {
    if (this.destroyed) return;
    this.srcA?.disconnect();
    this.srcA = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.srcA.connect(this.destB); // A's voice → B's mic input
    console.log("[PodcastBridge] Avatar A audio connected → Room B mic");
  }

  /** Feed avatar B's speech into the bridge (goes to room A) */
  setAvatarBTrack(track: MediaStreamTrack) {
    if (this.destroyed) return;
    this.srcB?.disconnect();
    this.srcB = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.srcB.connect(this.destA); // B's voice → A's mic input
    console.log("[PodcastBridge] Avatar B audio connected → Room A mic");
  }

  /** The track to publish as mic input in room A (carries B's voice) */
  getInputTrackForA(): MediaStreamTrack {
    return this.destA.stream.getAudioTracks()[0];
  }

  /** The track to publish as mic input in room B (carries A's voice) */
  getInputTrackForB(): MediaStreamTrack {
    return this.destB.stream.getAudioTracks()[0];
  }

  getState() {
    return this.ctx.state;
  }

  destroy() {
    this.destroyed = true;
    this.srcA?.disconnect();
    this.srcB?.disconnect();
    this.ctx.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/*  Inner host component (rendered inside each AvatarSession)         */
/* ------------------------------------------------------------------ */

function PodcastHostInner({
  hostId,
  character,
  bridge,
  onPublished,
}: {
  hostId: HostId;
  character: any;
  bridge: PodcastAudioBridge;
  onPublished: (hostId: HostId) => void;
}) {
  const room = useRoomContext();
  const session = useAvatarSession();
  const avatar = useAvatar();
  const publishedRef = useRef(false);
  const audioRoutedRef = useRef(false);
  const onPublishedRef = useRef(onPublished);

  useEffect(() => {
    onPublishedRef.current = onPublished;
  });

  const hasVideoTrack =
    avatar.videoTrackRef !== null && isTrackReference(avatar.videoTrackRef);

  // Publish bridge track as mic input when room connects
  useEffect(() => {
    if (session.state !== "active" || publishedRef.current) return;

    const inputTrack =
      hostId === "A"
        ? bridge.getInputTrackForA()
        : bridge.getInputTrackForB();

    if (!inputTrack) {
      console.warn(`[PodcastHost ${hostId}] No bridge track available`);
      return;
    }

    publishedRef.current = true;
    console.log(
      `[PodcastHost ${hostId}] Publishing bridge track to room (AudioContext: ${bridge.getState()})`
    );

    room.localParticipant
      .publishTrack(inputTrack, {
        source: Track.Source.Microphone,
        // Disable audio processing so the bridge audio passes through cleanly
        dtx: false,
        red: false,
      })
      .then(() => {
        console.log(`[PodcastHost ${hostId}] Bridge track published successfully`);
        onPublishedRef.current(hostId);
      })
      .catch((err) => {
        console.error(`[PodcastHost ${hostId}] Failed to publish bridge track:`, err);
        publishedRef.current = false;
      });
  }, [session.state, room, hostId, bridge]);

  // Capture remote avatar audio and route through bridge
  useEffect(() => {
    function handleTrackSubscribed(
      track: any,
      _publication: any,
      participant: any
    ) {
      if (participant.isLocal) return;
      if (track.kind !== Track.Kind.Audio) return;
      if (audioRoutedRef.current) return;
      audioRoutedRef.current = true;

      console.log(`[PodcastHost ${hostId}] Remote audio track received, routing to bridge`);

      if (hostId === "A") {
        bridge.setAvatarATrack(track.mediaStreamTrack);
      } else {
        bridge.setAvatarBTrack(track.mediaStreamTrack);
      }
    }

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

    // Check tracks already subscribed
    for (const p of Array.from(room.remoteParticipants.values())) {
      for (const pub of Array.from(p.trackPublications.values())) {
        if (
          pub.track &&
          pub.track.kind === Track.Kind.Audio &&
          pub.isSubscribed &&
          !audioRoutedRef.current
        ) {
          audioRoutedRef.current = true;
          console.log(
            `[PodcastHost ${hostId}] Found existing remote audio track, routing to bridge`
          );
          if (hostId === "A") {
            bridge.setAvatarATrack(pub.track.mediaStreamTrack);
          } else {
            bridge.setAvatarBTrack(pub.track.mediaStreamTrack);
          }
        }
      }
    }

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    };
  }, [room, hostId, bridge]);

  // Ensure audio playback
  useEffect(() => {
    if (session.state !== "active") return;
    room.startAudio().catch(() => undefined);
  }, [room, session.state]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {hasVideoTrack && avatar.videoTrackRef ? (
        <div className="h-full w-full overflow-hidden leading-none [&_.lk-participant-media-video]:h-full [&_.lk-participant-media-video]:w-full [&_.lk-participant-media-video]:overflow-hidden [&_.lk-participant-media-video>video]:block [&_.lk-participant-media-video>video]:h-full [&_.lk-participant-media-video>video]:w-full [&_.lk-participant-media-video>video]:object-cover">
          <VideoTrack
            trackRef={avatar.videoTrackRef as any}
            className="block h-full w-full bg-black object-cover"
          />
        </div>
      ) : (
        <div className="relative flex h-full min-h-full items-center justify-center overflow-hidden bg-black">
          {character?.avatarUrl ? (
            <>
              <div
                className="absolute inset-0 scale-[1.14] bg-cover bg-center blur-[24px]"
                style={{ backgroundImage: `url(${character.avatarUrl})` }}
              />
              <div
                className="absolute inset-0 bg-cover bg-center opacity-48"
                style={{ backgroundImage: `url(${character.avatarUrl})` }}
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#74614c,#2d241a_42%,#000000_100%)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.22),rgba(0,0,0,0.34))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_44%)]" />
          <div className="relative z-10 flex max-w-md flex-col items-center px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/28 bg-black/34 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-xl">
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              {session.state === "active" ? "Preparing" : "Connecting"}
            </div>
            {character?.name && (
              <p
                className="mt-4 text-[clamp(1.4rem,2.3vw,2rem)] font-semibold tracking-[-0.04em] text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {character.name}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Host card (wraps AvatarSession + chrome)                          */
/* ------------------------------------------------------------------ */

function HostCard({
  hostId,
  character,
  active,
  connection,
  bridge,
  onRetry,
  onPublished,
}: {
  hostId: HostId;
  character: any;
  active: boolean;
  connection: ConnectionState;
  bridge: PodcastAudioBridge;
  onRetry: () => void;
  onPublished: (hostId: HostId) => void;
}) {
  const isReady = connection.status === "ready";
  const hasError = connection.status === "error";

  return (
    <section
      className={cn(
        "flex min-h-[30rem] flex-col rounded-[30px] border bg-[#fcfaf6] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.04)] transition-colors duration-300",
        active
          ? "border-[#efb36c] shadow-[0_24px_46px_rgba(239,179,108,0.16)]"
          : "border-[#e8dfd1]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-1 pb-4 pt-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-2xl border border-[#eadfce] bg-[#f5eee2]">
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
          <p
            className="truncate text-lg font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {character.name}
          </p>
        </div>
        <div
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
            isReady
              ? "bg-[#ebf7ef] text-[#227a45]"
              : hasError
                ? "bg-rose-50 text-rose-700"
                : "bg-[#f7f0e3] text-[#996026]"
          )}
        >
          {isReady ? "Live" : hasError ? "Issue" : "Warming"}
        </div>
      </div>

      {/* Video area */}
      <div className="relative min-h-[24rem] flex-1 overflow-hidden rounded-[26px] bg-black ring-1 ring-black/6">
        {hasError ? (
          <div className="flex h-full min-h-[24rem] flex-col items-center justify-center px-6 text-center">
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#996026]">
              Live unavailable
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
              {connection.error}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : isReady ? (
          <AvatarSession
            credentials={connection.credentials}
            audio={false}
            video={false}
            onEnd={() => console.log(`[HostCard ${hostId}] Session ended`)}
            onError={(err) =>
              console.error(`[HostCard ${hostId}] Session error:`, err)
            }
          >
            <PodcastHostInner
              hostId={hostId}
              character={character}
              bridge={bridge}
              onPublished={onPublished}
            />
          </AvatarSession>
        ) : (
          <div className="flex h-full min-h-[24rem] items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/28 bg-black/34 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-xl">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting session
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main exported component                                           */
/* ------------------------------------------------------------------ */

export function PodcastRunwayStage({
  charA,
  charB,
  topic,
}: {
  charA: any;
  charB: any;
  topic: string;
}) {
  const [connA, setConnA] = useState<ConnectionState>({ status: "connecting" });
  const [connB, setConnB] = useState<ConnectionState>({ status: "connecting" });
  const [attemptA, setAttemptA] = useState(0);
  const [attemptB, setAttemptB] = useState(0);
  const [bridge, setBridge] = useState<PodcastAudioBridge | null>(null);
  const [published, setPublished] = useState<{ A: boolean; B: boolean }>({
    A: false,
    B: false,
  });
  const [liveStatus, setLiveStatus] = useState<
    "init" | "warming" | "bridging" | "live" | "error"
  >("init");

  const effectiveTopic =
    compactText(topic) ||
    `${charA.name} and ${charB.name} are in a live podcast conversation.`;

  /* ---- Create sessions ---- */

  const createSession = useCallback(
    async (
      character: any,
      partner: any,
      setConn: (c: ConnectionState) => void,
      signal: AbortSignal
    ) => {
      setConn({ status: "connecting" });
      try {
        const res = await fetch("/api/runway/realtime-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            maxDuration: 900,
            enableClientEvents: false,
            sessionPersonality: buildPodcastPersonality(
              character,
              partner.name,
              effectiveTopic
            ),
            startScript: character.greeting?.trim() || `Hello, I'm ${character.name}. Let's discuss ${effectiveTopic}.`,
          }),
        });
        const data = await readResponse(res);
        if (!res.ok) throw new Error(data.error || "Failed to start session");
        if (signal.aborted) return;
        setConn({
          status: "ready",
          credentials: {
            sessionId: data.sessionId,
            serverUrl: data.serverUrl,
            token: data.token,
            roomName: data.roomName,
          },
        });
      } catch (err: any) {
        if (!signal.aborted) {
          setConn({
            status: "error",
            error: err.message || "Failed to start session",
          });
        }
      }
    },
    [effectiveTopic]
  );

  // Fetch sessions when bridge is ready (user clicked Start)
  useEffect(() => {
    if (!bridge) return;
    const controller = new AbortController();
    void createSession(charA, charB, setConnA, controller.signal);
    return () => controller.abort();
  }, [bridge, attemptA, charA, charB, createSession]);

  useEffect(() => {
    if (!bridge) return;
    const controller = new AbortController();
    void createSession(charB, charA, setConnB, controller.signal);
    return () => controller.abort();
  }, [bridge, attemptB, charA, charB, createSession]);

  // Cleanup bridge on unmount
  useEffect(() => {
    return () => {
      bridge?.destroy();
    };
  }, [bridge]);

  /* ---- Start handler (user gesture → AudioContext) ---- */

  const handleStart = useCallback(() => {
    // Create AudioContext inside click handler so it starts in "running" state
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    console.log("[PodcastStage] AudioContext created, state:", ctx.state);

    // Force resume in case it's still suspended
    ctx.resume().then(() => {
      console.log("[PodcastStage] AudioContext resumed, state:", ctx.state);
    });

    const newBridge = new PodcastAudioBridge(ctx);
    setBridge(newBridge);
    setLiveStatus("warming");
    setPublished({ A: false, B: false });
  }, []);

  /* ---- Track published callback ---- */

  const handlePublished = useCallback((hostId: HostId) => {
    setPublished((prev) => {
      const next = { ...prev, [hostId]: true };
      if (next.A && next.B) {
        setLiveStatus("live");
      } else {
        setLiveStatus("bridging");
      }
      return next;
    });
  }, []);

  /* ---- Render ---- */

  const statusLabel =
    liveStatus === "init"
      ? "Click start to begin"
      : liveStatus === "warming"
        ? "Starting live sessions"
        : liveStatus === "bridging"
          ? "Connecting audio bridge"
          : liveStatus === "live"
            ? "Live podcast"
            : "Error";

  // Show start button if bridge hasn't been initialized yet
  if (!bridge) {
    return (
      <div className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center px-6 pb-6 pt-4">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f5e6cf]">
            <Radio className="h-8 w-8 text-[#996026]" />
          </div>
          <h2
            className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-slate-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Live Podcast
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {charA.name} and {charB.name} will have a live conversation
            about <span className="font-medium text-slate-700">{effectiveTopic}</span>.
            Each avatar runs in its own Runway session and hears the other
            through an audio bridge.
          </p>
          <button
            type="button"
            onClick={handleStart}
            className="mt-8 inline-flex h-12 items-center gap-2.5 rounded-full bg-slate-900 px-7 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            <Play className="h-4 w-4" />
            Start Live Podcast
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col px-6 pb-6 pt-4">
      <div className="flex min-h-0 flex-1 items-center">
        <div className="grid w-full gap-4 xl:grid-cols-2">
          <HostCard
            hostId="A"
            character={charA}
            active={liveStatus === "live"}
            connection={connA}
            bridge={bridge}
            onRetry={() => {
              setAttemptA((n) => n + 1);
            }}
            onPublished={handlePublished}
          />
          <HostCard
            hostId="B"
            character={charB}
            active={liveStatus === "live"}
            connection={connB}
            bridge={bridge}
            onRetry={() => {
              setAttemptB((n) => n + 1);
            }}
            onPublished={handlePublished}
          />
        </div>
      </div>

      <section className="mt-4 shrink-0 rounded-[24px] border border-[#e8dfd1] bg-white/92 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-[#f7f0e3] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#996026]">
              {statusLabel}
            </div>
            {published.A && (
              <div className="rounded-full border border-[#ece5d9] bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
                {charA.name} bridged
              </div>
            )}
            {published.B && (
              <div className="rounded-full border border-[#ece5d9] bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
                {charB.name} bridged
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
