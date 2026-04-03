"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { isTrackReference, useRoomContext } from "@livekit/components-react";
import {
  AvatarSession,
  AvatarVideo,
  VideoTrack,
  useAvatar,
  useAvatarSession,
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

function LiveCharacterPlaceholder({
  character,
  label,
}: {
  character: any;
  label: string;
}) {
  return (
    <div className="relative flex h-full min-h-full items-center justify-center overflow-hidden rounded-[28px] bg-[#f5efe3]">
      {character?.avatarUrl ? (
        <img
          src={character.avatarUrl}
          alt={character.name}
          className="absolute inset-0 h-full w-full object-cover opacity-20 blur-[2px]"
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
      <VideoTrack
        trackRef={avatar.videoTrackRef}
        className="h-full w-full bg-black object-cover"
      />
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const publishedTrackRef = useRef<MediaStreamTrack | null>(null);
  const bridgeInitPromiseRef = useRef<
    Promise<{
      audioContext: AudioContext;
      destination: MediaStreamAudioDestinationNode;
    }> | null
  >(null);
  const queueRef = useRef(Promise.resolve());

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
    if (context) {
      await context.close().catch(() => undefined);
    }

    postHostStatus(hostId, false);
  };

  const ensureAudioBridge = async () => {
    if (session.state !== "active") {
      throw new Error("Runway live session is not active yet");
    }

    if (!avatar.participant) {
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
        const mediaTrack = destinationRef.current?.stream.getAudioTracks()[0];
        if (!mediaTrack) {
          throw new Error("Unable to create podcast input audio track");
        }

        const microphonePublication = room.localParticipant.getTrackPublication(
          Track.Source.Microphone
        );
        const publishedMediaTrackId =
          microphonePublication?.track?.mediaStreamTrack?.id;

        if (publishedMediaTrackId !== mediaTrack.id) {
          await room.localParticipant.publishTrack(mediaTrack, {
            source: Track.Source.Microphone,
          });
        }

        publishedTrackRef.current = mediaTrack;
      }

      return {
        audioContext: audioContextRef.current!,
        destination: destinationRef.current!,
      };
    })();

    bridgeInitPromiseRef.current = initPromise;

    try {
      return await initPromise;
    } finally {
      if (bridgeInitPromiseRef.current === initPromise) {
        bridgeInitPromiseRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (session.state === "active" && avatar.participant && videoReady) {
      postHostStatus(hostId, true);
      return;
    }

    postHostStatus(hostId, false);
  }, [avatar.participant, hostId, session.state, videoReady]);

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
          onError(message);
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
  }, [ensureAudioBridge, hostId, onError]);

  useEffect(() => {
    return () => {
      void cleanupBridge();
    };
  }, []);

  useEffect(() => {
    if (session.state !== "active") return;
    void room.startAudio().catch(() => undefined);
  }, [room, session.state]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[28px] bg-black">
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
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
          <div className="rounded-full bg-white/88 px-4 py-2 text-[12px] font-medium text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            Audio needs a user gesture in this frame
          </div>
        </div>
      )}
    </div>
  );
}

export default function PodcastLiveHostPage() {
  const [character, setCharacter] = useState<any>(null);
  const [connection, setConnection] = useState<ConnectionState>({ status: "connecting" });

  const params = useMemo(() => {
    if (typeof window === "undefined") {
      return { characterId: "", hostId: "A" as HostId };
    }
    const search = new URLSearchParams(window.location.search);
    return {
      characterId: search.get("characterId") || "",
      hostId: (search.get("host") === "B" ? "B" : "A") as HostId,
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
  }, [character?.id, params.hostId]);

  if (!character || connection.status === "connecting") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#f5efe3]">
        <LiveCharacterPlaceholder character={character || {}} label="Starting session" />
      </div>
    );
  }

  if (connection.status !== "ready") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#f5efe3] px-6 text-center text-sm text-rose-700">
        {connection.status === "error" ? connection.error : "Runway live session ended"}
      </div>
    );
  }

  return (
    <div className={cn("h-screen w-screen overflow-hidden bg-black")}>
      <AvatarSession
        credentials={connection.credentials}
        audio={false}
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
