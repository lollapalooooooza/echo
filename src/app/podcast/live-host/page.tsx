"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { isTrackReference, useRoomContext } from "@livekit/components-react";
import {
  AvatarSession,
  AvatarVideo,
  VideoTrack,
  useAvatar,
  useAvatarSession,
  useTranscription,
  type SessionCredentials,
} from "@runwayml/avatars-react";
import { RoomEvent, Track } from "livekit-client";

import { cn } from "@/lib/utils";

type HostId = "A" | "B";

type ConnectionState =
  | { status: "connecting" }
  | { status: "ready"; credentials: SessionCredentials }
  | { status: "error"; error: string }
  | { status: "ended" };

const TRANSCRIPT_FLUSH_DELAY_MS = 1200;

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function truncatePromptText(value: string, maxLength = 320) {
  const normalized = compactText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

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
        .slice(0, 220) || `Request failed with status ${response.status}`,
  };
}

async function fetchPromptAudio(text: string, voiceId: string) {
  const response = await fetch("/api/voice/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voiceId,
      text: truncatePromptText(text, 1500),
    }),
  });

  if (!response.ok) {
    const payload = await readResponse(response);
    throw new Error(payload.error || "Failed to synthesize podcast prompt audio");
  }

  return response.arrayBuffer();
}

function postHostStatus(hostId: HostId, ready: boolean, error?: string | null) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(
    {
      type: "podcast-host-status",
      hostId,
      ready,
      error: error || null,
    },
    window.location.origin
  );
}

function postHostUtterance(hostId: HostId, text: string) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(
    {
      type: "podcast-host-utterance",
      hostId,
      text,
    },
    window.location.origin
  );
}

function buildPodcastLivePersonality(character: any, partnerName: string, topic: string) {
  const speakerName = character?.name?.trim() || "the current speaker";
  const otherSpeaker = partnerName.trim() || "the other host";
  const bio = compactText(character?.bio || "");
  const tone = compactText(character?.personalityTone || "") || "conversational";
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

function LiveCharacterPlaceholder({
  character,
  label,
}: {
  character: any;
  label: string;
}) {
  return (
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
          {label}
        </div>
        {character?.name ? (
          <p
            className="mt-4 text-[clamp(1.4rem,2.3vw,2rem)] font-semibold tracking-[-0.04em] text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {character.name}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RunwayFrameVideo({
  avatar,
  character,
  onVideoReadyChange,
}: {
  avatar: any;
  character: any;
  onVideoReadyChange: (ready: boolean) => void;
}) {
  const hasVideoTrack = avatar.status === "ready" && isTrackReference(avatar.videoTrackRef);

  useEffect(() => {
    onVideoReadyChange(hasVideoTrack);
  }, [hasVideoTrack, onVideoReadyChange]);

  if (hasVideoTrack) {
    return (
      <div className="h-full w-full overflow-hidden leading-none [&_.lk-participant-media-video]:h-full [&_.lk-participant-media-video]:w-full [&_.lk-participant-media-video]:overflow-hidden [&_.lk-participant-media-video>video]:block [&_.lk-participant-media-video>video]:h-full [&_.lk-participant-media-video>video]:w-full [&_.lk-participant-media-video>video]:object-cover">
        <VideoTrack
          trackRef={avatar.videoTrackRef}
          className="block h-full w-full bg-black object-cover"
        />
      </div>
    );
  }

  return (
    <LiveCharacterPlaceholder
      character={character}
      label={avatar.status === "connecting" ? "Connecting" : "Preparing"}
    />
  );
}

function PodcastHostRuntime({
  hostId,
  character,
  onError,
}: {
  hostId: HostId;
  character: any;
  onError: (error: string) => void;
}) {
  const room = useRoomContext();
  const session = useAvatarSession();
  const avatar = useAvatar();
  const [canPlaybackAudio, setCanPlaybackAudio] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const publishedTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingUtteranceRef = useRef("");
  const flushTimerRef = useRef<number | null>(null);
  const seenSegmentIdsRef = useRef<string[]>([]);
  const bridgeInitPromiseRef = useRef<
    Promise<{
      audioContext: AudioContext;
      destination: MediaStreamAudioDestinationNode;
    }> | null
  >(null);
  const queueRef = useRef(Promise.resolve());
  const sessionRef = useRef(session);
  const avatarRef = useRef(avatar);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    sessionRef.current = session;
    avatarRef.current = avatar;
    onErrorRef.current = onError;
  });

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

  const flushUtterance = () => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const utterance = compactText(pendingUtteranceRef.current);
    pendingUtteranceRef.current = "";
    if (!utterance) return;

    postHostUtterance(hostId, utterance);
  };

  const cleanupBridge = async () => {
    bridgeInitPromiseRef.current = null;
    const publishedTrack = publishedTrackRef.current;
    publishedTrackRef.current = null;

    if (publishedTrack) {
      await room.localParticipant.unpublishTrack(publishedTrack, false).catch(() => undefined);
      publishedTrack.stop();
    }

    const context = audioContextRef.current;
    audioContextRef.current = null;
    destinationRef.current = null;
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    pendingUtteranceRef.current = "";
    seenSegmentIdsRef.current = [];
    if (context) {
      await context.close().catch(() => undefined);
    }

    postHostStatus(hostId, false);
  };

  useTranscription((entry) => {
    if (entry.participantIdentity !== avatar.participant?.identity) return;
    const text = compactText(entry.text);
    if (!text) return;
    if (seenSegmentIdsRef.current.includes(entry.id)) return;

    seenSegmentIdsRef.current = [...seenSegmentIdsRef.current.slice(-39), entry.id];
    pendingUtteranceRef.current = compactText(
      `${pendingUtteranceRef.current} ${text}`
    );

    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
    }

    flushTimerRef.current = window.setTimeout(() => {
      flushUtterance();
    }, TRANSCRIPT_FLUSH_DELAY_MS);
  });

  const ensureAudioBridge = useCallback(async () => {
    if (sessionRef.current.state !== "active") {
      throw new Error("Runway live session is not active yet");
    }

    if (!avatarRef.current.participant) {
      throw new Error(`${character.name} is still joining the live room`);
    }

    if (bridgeInitPromiseRef.current) {
      return bridgeInitPromiseRef.current;
    }

    const initPromise = (async () => {
      const AudioContextCtor =
        typeof window !== "undefined"
          ? window.AudioContext || (window as any).webkitAudioContext
          : null;
      if (!AudioContextCtor) {
        throw new Error("This browser does not support Web Audio");
      }

      if (!audioContextRef.current) {
        const context = new AudioContextCtor();
        audioContextRef.current = context;
        destinationRef.current = context.createMediaStreamDestination();
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      if (!publishedTrackRef.current) {
        const syntheticTrack = destinationRef.current?.stream.getAudioTracks()[0];
        if (!syntheticTrack) {
          throw new Error("Unable to create podcast input audio track");
        }

        // Swap the SDK's real microphone MediaStreamTrack with our silent
        // synthetic stream using LiveKit's replaceTrack API.  This is seamless:
        // the publication stays intact, so the SDK doesn't try to re-capture the
        // real mic, and the Runway avatar receives only audio we explicitly play
        // through the Web Audio bridge.
        const existingMicPub = room.localParticipant.getTrackPublication(
          Track.Source.Microphone
        );

        if (
          existingMicPub?.track &&
          typeof (existingMicPub.track as any).replaceTrack === "function"
        ) {
          await (existingMicPub.track as any).replaceTrack(syntheticTrack);
        } else {
          // Fallback for older SDK versions: unpublish then re-publish
          if (existingMicPub?.track?.mediaStreamTrack) {
            await room.localParticipant
              .unpublishTrack(existingMicPub.track.mediaStreamTrack, true)
              .catch(() => undefined);
            existingMicPub.track.mediaStreamTrack.stop();
          }
          await room.localParticipant.publishTrack(syntheticTrack, {
            source: Track.Source.Microphone,
          });
        }

        publishedTrackRef.current = syntheticTrack;
      }

      return {
        audioContext: audioContextRef.current!,
        destination: destinationRef.current!,
      };
    })();

    bridgeInitPromiseRef.current = initPromise;

    try {
      return await initPromise;
    } catch (error) {
      // Only clear on failure so subsequent calls retry; on success keep it cached
      if (bridgeInitPromiseRef.current === initPromise) {
        bridgeInitPromiseRef.current = null;
      }
      throw error;
    }
  }, [character.name, room]);

  const warmLiveSession = async () => {
    try {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
      await room.startAudio();
      setCanPlaybackAudio(true);
    } catch {
      // Keep the wake control visible until the browser allows playback.
    }
  };

  // Eagerly initialise the audio bridge as soon as the session is active and
  // the avatar participant has joined.  This replaces the SDK's real-microphone
  // track with our silent synthetic stream so the avatar does NOT respond to
  // ambient mic noise — it will only hear audio when we explicitly play TTS.
  // We wait briefly for the SDK to publish its mic track first so replaceTrack
  // can swap it in-place rather than racing against the SDK's async capture.
  useEffect(() => {
    if (session.state !== "active" || !avatar.participant) return;
    let cancelled = false;

    const waitForMicThenBridge = async () => {
      // Give the SDK up to ~3 seconds to publish its mic track
      for (let i = 0; i < 15; i++) {
        if (cancelled) return;
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (cancelled) return;
      await ensureAudioBridge();
      if (!cancelled) setBridgeReady(true);
    };

    waitForMicThenBridge().catch(() => { /* will retry on first prompt */ });
    return () => { cancelled = true; };
  }, [session.state, avatar.participant, ensureAudioBridge, room]);

  useEffect(() => {
    if (session.state === "active" && avatar.participant && videoReady && bridgeReady) {
      postHostStatus(hostId, true);
      return;
    }

    postHostStatus(hostId, false);
  }, [avatar.participant, bridgeReady, hostId, session.state, videoReady]);

  useEffect(() => {
    const expectedOrigin = window.location.origin;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      if (!event.data || event.data.type !== "podcast-host-prompt" || event.data.hostId !== hostId) {
        return;
      }

      const { requestId, text, voiceId } = event.data as {
        requestId: string;
        text: string;
        voiceId?: string | null;
      };

      const run = queueRef.current.then(async () => {
        flushUtterance();
        const bridge = await ensureAudioBridge();
        const audioBuffer = await fetchPromptAudio(
          compactText(text),
          voiceId || "clara"
        );
        const decoded = await bridge.audioContext.decodeAudioData(audioBuffer.slice(0));

        await new Promise<void>((resolve) => {
          const source = bridge.audioContext.createBufferSource();
          const gain = bridge.audioContext.createGain();
          gain.gain.value = 1;
          source.buffer = decoded;
          source.connect(gain);
          gain.connect(bridge.destination);
          source.onended = () => {
            source.disconnect();
            gain.disconnect();
            resolve();
          };
          source.start(0);
        });
      });

      queueRef.current = run.catch(() => undefined);

      run
        .then(() => {
          window.parent.postMessage(
            {
              type: "podcast-host-prompt-result",
              hostId,
              requestId,
              ok: true,
            },
            expectedOrigin
          );
        })
        .catch((error: any) => {
          const message = error?.message || "Failed to play live prompt";
          onErrorRef.current(message);
          window.parent.postMessage(
            {
              type: "podcast-host-prompt-result",
              hostId,
              requestId,
              ok: false,
              error: message,
            },
            expectedOrigin
          );
        });
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [ensureAudioBridge, hostId]);

  useEffect(() => {
    return () => {
      flushUtterance();
      void cleanupBridge();
    };
  }, []);

  useEffect(() => {
    if (session.state !== "active") return;
    void room.startAudio().catch(() => undefined);
  }, [room, session.state]);

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-black"
      onPointerDownCapture={() => void warmLiveSession()}
    >
      <AvatarVideo>
        {(status) => {
          return (
            <RunwayFrameVideo
              avatar={status}
              character={character}
              onVideoReadyChange={setVideoReady}
            />
          );
        }}
      </AvatarVideo>

      {!canPlaybackAudio && (
        <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <button
            type="button"
            onClick={() => void warmLiveSession()}
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

export default function PodcastLiveHostPage() {
  const [character, setCharacter] = useState<any>(null);
  const [connection, setConnection] = useState<ConnectionState>({ status: "connecting" });
  const liveStageShellClass =
    "h-screen w-screen overflow-hidden bg-black leading-none [&>.lk-room-container]:flex [&>.lk-room-container]:h-full [&>.lk-room-container]:w-full [&>.lk-room-container]:min-h-0 [&>.lk-room-container]:flex-col";

  const params = useMemo(() => {
    if (typeof window === "undefined") {
      return { characterId: "", hostId: "A" as HostId, topic: "", partnerName: "" };
    }
    const search = new URLSearchParams(window.location.search);
    return {
      characterId: search.get("characterId") || "",
      hostId: (search.get("host") === "B" ? "B" : "A") as HostId,
      topic: search.get("topic") || "",
      partnerName: search.get("partnerName") || "",
    };
  }, []);

  useEffect(() => {
    if (!params.characterId) return;

    let cancelled = false;

    async function loadCharacter() {
      const response = await fetch("/api/characters");
      const list = await response.json();
      if (cancelled) return;

      const found = Array.isArray(list)
        ? list.find((entry: any) => entry.id === params.characterId)
        : null;

      if (!found) {
        setConnection({ status: "error", error: "Character not found" });
        postHostStatus(params.hostId, false, "Character not found");
        return;
      }

      setCharacter(found);
    }

    void loadCharacter();
    return () => {
      cancelled = true;
    };
  }, [params.characterId, params.hostId]);

  useEffect(() => {
    if (!character?.id) return;

    let cancelled = false;

    async function connect() {
      setConnection({ status: "connecting" });
      postHostStatus(params.hostId, false);

      try {
        const response = await fetch("/api/runway/realtime-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            maxDuration: 900,
            enableClientEvents: false,
            sessionPersonality: buildPodcastLivePersonality(
              character,
              params.partnerName,
              params.topic
            ),
            startScript: "",
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
        const message = error.message || "Failed to start Runway live session";
        setConnection({ status: "error", error: message });
        postHostStatus(params.hostId, false, message);
      }
    }

    void connect();

    return () => {
      cancelled = true;
    };
  }, [character, params.hostId, params.partnerName, params.topic]);

  if (!character || connection.status === "connecting") {
    return (
      <div className="h-screen w-screen overflow-hidden bg-black">
        <LiveCharacterPlaceholder character={character || {}} label="Starting session" />
      </div>
    );
  }

  if (connection.status !== "ready") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black px-6">
        <div className="max-w-sm rounded-[28px] border border-white/12 bg-black/58 px-6 py-5 text-center text-sm text-white/86 shadow-[0_16px_48px_rgba(0,0,0,0.24)] backdrop-blur-xl">
          {connection.status === "error" ? connection.error : "Runway live session ended"}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(liveStageShellClass)}>
      <AvatarSession
        credentials={connection.credentials}
        audio
        video={false}
        __unstable_roomOptions={{
          adaptiveStream: true,
          dynacast: true,
        }}
        onEnd={() => {
          setConnection({ status: "ended" });
          postHostStatus(params.hostId, false, "Runway live session ended");
        }}
        onError={(error) => {
          const message = error.message || "Runway live session ended unexpectedly";
          setConnection({ status: "error", error: message });
          postHostStatus(params.hostId, false, message);
        }}
      >
        <PodcastHostRuntime
          hostId={params.hostId}
          character={character}
          onError={(error) => postHostStatus(params.hostId, false, error)}
        />
      </AvatarSession>
    </div>
  );
}
