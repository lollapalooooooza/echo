"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Volume2,
} from "lucide-react";
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

type SpeakerId = "A" | "B";

type ConnectionState =
  | { status: "connecting" }
  | { status: "ready"; credentials: SessionCredentials }
  | { status: "error"; error: string }
  | { status: "ended" };

type LiveStatus = "idle" | "starting" | "active" | "paused" | "ended" | "error";

type LiveTranscriptMessage = {
  id: string;
  speaker: SpeakerId;
  speakerName: string;
  content: string;
  pending?: boolean;
};

type PodcastLiveSessionHandle = {
  isReady: () => boolean;
  prompt: (text: string, voiceId?: string) => Promise<void>;
};

const DEFAULT_PROMPT_VOICE_ID = "clara";
const MAX_LIVE_TURNS = 12;

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function truncatePromptText(value: string, maxLength = 320) {
  const normalized = compactText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildDeliveryPrompt(character: any, response: string) {
  return truncatePromptText(
    `Stay fully in character as ${character.name}. ` +
      `Speak the following podcast reply naturally and conversationally. ` +
      `Keep the meaning unchanged and do not add setup or explanation: "${truncatePromptText(response, 520)}"`,
    760
  );
}

function estimateTurnPlaybackMs(text: string) {
  const wordCount = compactText(text).split(/\s+/).filter(Boolean).length;
  return Math.min(14_000, Math.max(3_500, Math.round(wordCount * 360 + 1_200)));
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

function LiveCharacterPlaceholder({
  character,
  label,
  detail,
  active = false,
}: {
  character: any;
  label: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-[21rem] items-center justify-center overflow-hidden rounded-[28px] border bg-[#f5efe3]",
        active ? "border-orange-300 shadow-[0_0_0_1px_rgba(251,146,60,0.16)]" : "border-white/80"
      )}
    >
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
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] backdrop-blur-xl",
            active
              ? "border-orange-200 bg-orange-50/92 text-orange-700"
              : "border-white/80 bg-white/76 text-emerald-700"
          )}
        >
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

const PodcastSessionRuntime = forwardRef<
  PodcastLiveSessionHandle,
  {
    character: any;
    active: boolean;
    onReadyChange: (ready: boolean) => void;
  }
>(function PodcastSessionRuntime(
  { character, active, onReadyChange },
  ref
) {
  const room = useRoomContext();
  const session = useAvatarSession();
  const avatar = useAvatar();
  const [canPlaybackAudio, setCanPlaybackAudio] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const publishedTrackRef = useRef<MediaStreamTrack | null>(null);
  const bridgeInitPromiseRef = useRef<
    Promise<{
      audioContext: AudioContext;
      destination: MediaStreamAudioDestinationNode;
    }> | null
  >(null);
  const bridgeReadyRef = useRef(false);
  const readyRef = useRef(false);
  const queueRef = useRef(Promise.resolve());

  const setReadyState = useCallback(
    (next: boolean) => {
      if (readyRef.current === next) return;
      readyRef.current = next;
      onReadyChange(next);
    },
    [onReadyChange]
  );

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

  const cleanupBridge = useCallback(async () => {
    bridgeInitPromiseRef.current = null;
    bridgeReadyRef.current = false;
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

    setReadyState(false);
  }, [room, setReadyState]);

  const ensureAudioBridge = useCallback(async () => {
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

      bridgeReadyRef.current = true;
      setReadyState(true);

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
  }, [avatar.participant, character.name, room, session.state, setReadyState]);

  useEffect(() => {
    if (session.state === "active" && avatar.participant) {
      void ensureAudioBridge().catch((error) => {
        console.error("[PodcastRunwayStage] Failed to initialize live audio bridge:", error);
        setReadyState(false);
      });
      return;
    }

    bridgeReadyRef.current = false;
    setReadyState(false);
  }, [avatar.participant, ensureAudioBridge, session.state, setReadyState]);

  useEffect(() => {
    return () => {
      void cleanupBridge();
    };
  }, [cleanupBridge]);

  const playPrompt = useCallback(
    async (text: string, voiceId?: string) => {
      const normalized = compactText(text);
      if (!normalized) return;

      const bridge = await ensureAudioBridge();
      const requestedVoiceId = voiceId || DEFAULT_PROMPT_VOICE_ID;
      let audioBuffer: ArrayBuffer;

      try {
        audioBuffer = await fetchPromptAudio(normalized, requestedVoiceId);
      } catch (error) {
        if (requestedVoiceId === DEFAULT_PROMPT_VOICE_ID) {
          throw error;
        }

        audioBuffer = await fetchPromptAudio(normalized, DEFAULT_PROMPT_VOICE_ID);
      }

      const decoded = await bridge.audioContext.decodeAudioData(audioBuffer.slice(0));

      await new Promise<void>((resolve) => {
        const source = bridge.audioContext.createBufferSource();
        const gain = bridge.audioContext.createGain();
        gain.gain.value = 1;
        source.buffer = decoded;
        source.connect(gain);
        gain.connect(bridge.destination!);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
          resolve();
        };
        source.start(0);
      });
    },
    [ensureAudioBridge]
  );

  useImperativeHandle(
    ref,
    () => ({
      isReady: () => readyRef.current,
      prompt: (text: string, voiceId?: string) => {
        const run = queueRef.current.then(() => playPrompt(text, voiceId));
        queueRef.current = run.catch(() => undefined);
        return run;
      },
    }),
    [playPrompt]
  );

  async function enableAudioPlayback() {
    try {
      await room.startAudio();
      setCanPlaybackAudio(true);
    } catch {
      // keep the button visible if playback is still blocked
    }
  }

  return (
    <div className="relative h-full min-h-[21rem] overflow-hidden rounded-[28px]">
      <AvatarVideo>
        {(status) => {
          const hasVideoTrack =
            status.status === "ready" && isTrackReference(status.videoTrackRef);

          if (hasVideoTrack) {
            return (
              <VideoTrack
                trackRef={status.videoTrackRef}
                className="h-full w-full object-cover"
              />
            );
          }

          return (
            <LiveCharacterPlaceholder
              character={character}
              label={status.status === "connecting" ? "Connecting" : "Preparing"}
              detail="Runway is bringing this live host onto the podcast stage."
              active={active}
            />
          );
        }}
      </AvatarVideo>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
        <div
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] shadow-sm backdrop-blur-xl",
            active
              ? "bg-orange-50/94 text-orange-700"
              : "bg-white/82 text-emerald-700"
          )}
        >
          {active ? "Speaking" : "Runway Live"}
        </div>
        <div className="rounded-full bg-slate-950/78 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-xl">
          {character.name}
        </div>
      </div>

      {!canPlaybackAudio && (
        <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
          <button
            type="button"
            onClick={() => void enableAudioPlayback()}
            className="inline-flex items-center gap-2 rounded-full bg-white/88 px-4 py-2 text-[12px] font-medium text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-colors hover:bg-white"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Enable live audio
          </button>
        </div>
      )}
    </div>
  );
});

const PodcastSessionCard = forwardRef<
  PodcastLiveSessionHandle,
  {
    speaker: SpeakerId;
    character: any;
    active: boolean;
    onReadyChange: (speaker: SpeakerId, ready: boolean) => void;
  }
>(function PodcastSessionCard(
  { speaker, character, active, onReadyChange },
  ref
) {
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>(
    character?.runwayCharacterId
      ? { status: "connecting" }
      : { status: "error", error: "No linked Runway avatar" }
  );
  const runtimeRef = useRef<PodcastLiveSessionHandle | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      isReady: () =>
        connection.status === "ready" && !!runtimeRef.current?.isReady(),
      prompt: async (text: string, voiceId?: string) => {
        if (connection.status !== "ready" || !runtimeRef.current?.isReady()) {
          throw new Error(`${character.name} is still warming up`);
        }
        await runtimeRef.current.prompt(text, voiceId);
      },
    }),
    [character.name, connection.status]
  );

  useEffect(() => {
    onReadyChange(speaker, false);

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
        onReadyChange(speaker, false);
        setConnection({
          status: "error",
          error: error.message || "Failed to start Runway live session",
        });
      }
    }

    void connect();

    return () => {
      cancelled = true;
      onReadyChange(speaker, false);
    };
  }, [attempt, character?.id, character?.runwayCharacterId, onReadyChange, speaker]);

  return (
    <section
      className={cn(
        "flex min-h-[30rem] flex-col rounded-[32px] border bg-white/82 p-3 shadow-[0_28px_90px_-60px_rgba(245,158,11,0.45)] backdrop-blur-xl transition-all duration-300",
        active
          ? "border-orange-300 shadow-[0_28px_90px_-48px_rgba(251,146,60,0.36)]"
          : "border-white/80"
      )}
    >
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
        <div
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
            connection.status === "ready"
              ? "bg-emerald-50 text-emerald-700"
              : connection.status === "connecting"
              ? "bg-amber-50 text-amber-700"
              : "bg-rose-50 text-rose-700"
          )}
        >
          {connection.status === "ready"
            ? "Live"
            : connection.status === "connecting"
            ? "Warming"
            : "Issue"}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {connection.status === "ready" ? (
          <AvatarSession
            key={`${character.id}:${attempt}`}
            credentials={connection.credentials}
            audio={false}
            video={false}
            onEnd={() => {
              onReadyChange(speaker, false);
              setConnection({ status: "ended" });
            }}
            onError={(error) => {
              onReadyChange(speaker, false);
              setConnection({
                status: "error",
                error: error.message || "Runway live session ended unexpectedly",
              });
            }}
          >
            <PodcastSessionRuntime
              ref={runtimeRef}
              character={character}
              active={active}
              onReadyChange={(ready) => onReadyChange(speaker, ready)}
            />
          </AvatarSession>
        ) : connection.status === "connecting" ? (
          <LiveCharacterPlaceholder
            character={character}
            label="Starting session"
            detail="Fetching fresh Runway credentials and bringing this character online."
            active={active}
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
                ? "This live host finished its current session. Start a fresh one to continue the podcast."
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
});

function LiveTranscriptBubble({
  message,
}: {
  message: LiveTranscriptMessage;
}) {
  const alignRight = message.speaker === "B";

  return (
    <div
      className={cn(
        "flex",
        alignRight ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-[24px] border px-4 py-3 shadow-sm",
          alignRight
            ? "border-orange-200 bg-orange-50"
            : "border-neutral-200 bg-white"
        )}
      >
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.18em]",
            alignRight ? "text-orange-700/75" : "text-slate-400"
          )}
        >
          {message.speakerName}
        </p>
        <p className="mt-1.5 text-sm leading-6 text-slate-700">
          {message.content || (message.pending ? "Listening…" : "…")}
        </p>
      </div>
    </div>
  );
}

export function PodcastRunwayStage({
  charA,
  charB,
  topic,
  onTopicChange,
}: {
  charA: any;
  charB: any;
  topic: string;
  onTopicChange: (value: string) => void;
}) {
  const sessionARef = useRef<PodcastLiveSessionHandle | null>(null);
  const sessionBRef = useRef<PodcastLiveSessionHandle | null>(null);
  const queuedSpeakerRef = useRef<{
    speaker: SpeakerId;
    token: number;
  } | null>(null);
  const turnAdvanceTimerRef = useRef<number | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const conversationTokenRef = useRef(0);
  const turnCountRef = useRef(0);
  const statusRef = useRef<LiveStatus>("idle");
  const messagesRef = useRef<LiveTranscriptMessage[]>([]);

  const [sessionReady, setSessionReady] = useState<{ A: boolean; B: boolean }>({
    A: false,
    B: false,
  });
  const [messages, setMessages] = useState<LiveTranscriptMessage[]>([]);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [activeSpeaker, setActiveSpeaker] = useState<SpeakerId | null>(null);
  const [liveError, setLiveError] = useState("");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearAdvanceTimer = useCallback(() => {
    if (turnAdvanceTimerRef.current) {
      window.clearTimeout(turnAdvanceTimerRef.current);
      turnAdvanceTimerRef.current = null;
    }
  }, []);

  const resetConversation = useCallback(
    (nextStatus: LiveStatus) => {
      conversationTokenRef.current += 1;
      clearAdvanceTimer();
      queuedSpeakerRef.current = null;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      turnCountRef.current = 0;
      setActiveSpeaker(null);
      setStatus(nextStatus);
    },
    [clearAdvanceTimer]
  );

  useEffect(() => {
    return () => {
      resetConversation("idle");
    };
  }, [resetConversation]);

  const getCharacter = useCallback(
    (speaker: SpeakerId) => (speaker === "A" ? charA : charB),
    [charA, charB]
  );

  const getSessionHandle = useCallback(
    (speaker: SpeakerId) => (speaker === "A" ? sessionARef.current : sessionBRef.current),
    []
  );

  const handleReadyChange = useCallback((speaker: SpeakerId, ready: boolean) => {
    setSessionReady((current) => {
      if (current[speaker] === ready) return current;
      return { ...current, [speaker]: ready };
    });
  }, []);

  const generateTurnText = useCallback(
    async (speaker: SpeakerId, token: number) => {
      if (token !== conversationTokenRef.current) return "";

      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;

      const character = getCharacter(speaker);
      const history = messagesRef.current
        .filter((message) => compactText(message.content))
        .map((message) => ({
          speaker: message.speakerName,
          content: message.content,
        }))
        .slice(-10);

      const messageId = `live-${speaker}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setMessages((current) => [
        ...current,
        {
          id: messageId,
          speaker,
          speakerName: character.name,
          content: "",
          pending: true,
        },
      ]);

      const response = await fetch("/api/podcast/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterIdA: charA.id,
          characterIdB: charB.id,
          topic,
          history,
          speakerTurn: speaker,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await readResponse(response);
        throw new Error(data.error || "Failed to generate podcast turn");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Podcast turn stream was unavailable");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        if (token !== conversationTokenRef.current) {
          await reader.cancel().catch(() => undefined);
          return "";
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const eventMatch = frame.match(/^event:\s*(.+)$/m);
          const dataMatch = frame.match(/^data:\s*(.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const eventType = eventMatch[1].trim();
          const payload = JSON.parse(dataMatch[1]);

          if (eventType === "text" && typeof payload.text === "string") {
            fullText += payload.text;
            const nextText = compactText(fullText);
            setMessages((current) =>
              current.map((message) =>
                message.id === messageId
                  ? { ...message, content: nextText, pending: true }
                  : message
              )
            );
          }

          if (eventType === "error") {
            throw new Error(payload.error || "Podcast generation failed");
          }
        }
      }

      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null;
      }

      const finalText = compactText(fullText);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, content: finalText || "…", pending: false }
            : message
        )
      );

      return finalText;
    },
    [charA.id, charB.id, getCharacter, topic]
  );

  const runTurn = useCallback(
    async (speaker: SpeakerId, token: number) => {
      if (token !== conversationTokenRef.current) return;

      const handle = getSessionHandle(speaker);
      const character = getCharacter(speaker);
      if (!handle?.isReady()) {
        throw new Error(`${character.name} is still warming up`);
      }

      setActiveSpeaker(speaker);
      if (turnCountRef.current === 0) {
        setStatus("starting");
      }

      const generatedText = await generateTurnText(speaker, token);
      if (token !== conversationTokenRef.current) return;

      if (!compactText(generatedText)) {
        throw new Error(`${character.name} did not produce a usable podcast turn`);
      }

      await handle.prompt(
        buildDeliveryPrompt(character, generatedText),
        DEFAULT_PROMPT_VOICE_ID
      );
      if (token !== conversationTokenRef.current) return;

      if (statusRef.current !== "paused") {
        setStatus("active");
      }

      turnCountRef.current += 1;
      if (turnCountRef.current >= MAX_LIVE_TURNS) {
        setActiveSpeaker(null);
        setStatus("ended");
        return;
      }

      const nextSpeaker = speaker === "A" ? "B" : "A";
      clearAdvanceTimer();
      turnAdvanceTimerRef.current = window.setTimeout(() => {
        if (token !== conversationTokenRef.current) return;

        if (statusRef.current === "paused") {
          queuedSpeakerRef.current = { speaker: nextSpeaker, token };
          return;
        }

        void runTurn(nextSpeaker, token).catch((error: any) => {
          if (token !== conversationTokenRef.current) return;
          setActiveSpeaker(null);
          setStatus("error");
          setLiveError(error.message || "Failed to continue the Runway live podcast");
        });
      }, estimateTurnPlaybackMs(generatedText));
    },
    [clearAdvanceTimer, generateTurnText, getCharacter, getSessionHandle]
  );

  const startLivePodcast = useCallback(async () => {
    const normalizedTopic = compactText(topic);
    if (!normalizedTopic) return;

    if (!sessionReady.A || !sessionReady.B) {
      setLiveError("Both Runway live hosts need to be ready before the podcast can start.");
      return;
    }

    const token = conversationTokenRef.current + 1;
    conversationTokenRef.current = token;
    clearAdvanceTimer();
    queuedSpeakerRef.current = null;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    turnCountRef.current = 0;

    setMessages([]);
    setLiveError("");
    setActiveSpeaker("A");
    setStatus("starting");

    try {
      await runTurn("A", token);
    } catch (error: any) {
      if (token !== conversationTokenRef.current) return;
      setActiveSpeaker(null);
      setStatus("error");
      setLiveError(error.message || "Failed to start the Runway live podcast");
    }
  }, [clearAdvanceTimer, runTurn, sessionReady.A, sessionReady.B, topic]);

  const togglePaused = useCallback(async () => {
    if (statusRef.current === "paused") {
      setStatus("active");
      const queuedSpeaker = queuedSpeakerRef.current;
      queuedSpeakerRef.current = null;
      if (!queuedSpeaker) return;

      try {
        await runTurn(queuedSpeaker.speaker, queuedSpeaker.token);
      } catch (error: any) {
        if (queuedSpeaker.token !== conversationTokenRef.current) return;
        setActiveSpeaker(null);
        setStatus("error");
        setLiveError(error.message || "Failed to resume the Runway live podcast");
      }
      return;
    }

    if (statusRef.current === "starting" || statusRef.current === "active") {
      setStatus("paused");
    }
  }, [runTurn]);

  const restartLivePodcast = useCallback(() => {
    void startLivePodcast();
  }, [startLivePodcast]);

  const liveReady = sessionReady.A && sessionReady.B;
  const liveStatusLabel =
    !liveReady
      ? "Warming live hosts"
      : status === "idle"
      ? "Ready to start"
      : status === "starting"
      ? "Injecting opening prompt"
      : status === "active"
      ? activeSpeaker
        ? `${getCharacter(activeSpeaker).name} is speaking`
        : "Listening for the next turn"
      : status === "paused"
      ? "Podcast paused"
      : status === "ended"
      ? "Podcast complete"
      : "Live orchestration error";

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col px-6 pb-6 pt-4">
      <div className="flex min-h-0 flex-1 items-center">
        <div className="grid w-full gap-5 xl:grid-cols-[minmax(0,1fr)_24rem_minmax(0,1fr)]">
        <PodcastSessionCard
          ref={sessionARef}
          speaker="A"
          character={charA}
          active={activeSpeaker === "A"}
          onReadyChange={handleReadyChange}
        />

        <aside className="flex flex-col justify-between rounded-[32px] border border-amber-200/70 bg-[linear-gradient(160deg,#fff7e2_0%,#fffdf7_58%,#ffffff_100%)] p-5 shadow-[0_28px_90px_-60px_rgba(245,158,11,0.42)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/86 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 shadow-sm">
              <Volume2 className="h-3.5 w-3.5" />
              Live orchestration
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Discussion topic
              </label>
              <input
                value={topic}
                onChange={(event) => onTopicChange(event.target.value)}
                placeholder="e.g. The future of AI in education..."
                className="h-12 w-full rounded-2xl border border-neutral-300 bg-white px-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-orange-400"
              />
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-white/90 bg-white/82 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Live status
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">{liveStatusLabel}</p>
            <p className="mt-2 text-[12px] leading-5 text-slate-500">
              Turns completed: {turnCountRef.current} / {MAX_LIVE_TURNS}
            </p>

            {liveError && (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
                {liveError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startLivePodcast()}
                disabled={!compactText(topic) || !liveReady || status === "starting"}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {status === "starting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {status === "active" || status === "paused" ? "Restart live podcast" : "Start live podcast"}
              </button>

              {(status === "starting" || status === "active" || status === "paused") && (
                <button
                  type="button"
                  onClick={() => void togglePaused()}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-neutral-50"
                >
                  {status === "paused" ? (
                    <>
                      <Play className="h-4 w-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4" />
                      Pause
                    </>
                  )}
                </button>
              )}

              {(status === "ended" || status === "error") && (
                <button
                  type="button"
                  onClick={restartLivePodcast}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-neutral-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restart
                </button>
              )}
            </div>
          </div>
        </aside>

        <PodcastSessionCard
          ref={sessionBRef}
          speaker="B"
          character={charB}
          active={activeSpeaker === "B"}
          onReadyChange={handleReadyChange}
        />
        </div>
      </div>

      <section className="mt-5 min-h-0 shrink-0 rounded-[32px] border border-white/80 bg-white/84 p-5 shadow-[0_28px_90px_-60px_rgba(245,158,11,0.45)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Live transcript
            </p>
            <p className="mt-1 text-sm text-slate-600">
              This transcript is driven by the two active Runway sessions, not the fallback chat box.
            </p>
          </div>
          {activeSpeaker && (
            <div className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
              {getCharacter(activeSpeaker).name} live
            </div>
          )}
        </div>

        <div className="mt-5 min-h-[14rem] space-y-4 overflow-y-auto pr-1">
          {messages.length > 0 ? (
            messages.map((message) => (
              <LiveTranscriptBubble key={message.id} message={message} />
            ))
          ) : (
            <div className="flex min-h-[14rem] items-center justify-center rounded-[28px] border border-dashed border-neutral-200 bg-[#faf7f0] px-6 text-center">
              <p className="max-w-lg text-sm leading-7 text-slate-500">
                Start the live podcast to watch both Runway avatars talk across the stage and stream their transcript here in real time.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
