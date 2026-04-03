"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

import { PodcastLiveHostFrame, type PodcastLiveHostHandle } from "@/components/podcast-live-host-frame";

type SpeakerId = "A" | "B";
type LiveStatus = "idle" | "starting" | "active" | "paused" | "ended" | "error";

const DEFAULT_PROMPT_VOICE_ID = "clara";
const MAX_LIVE_TURNS = 12;

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function truncatePromptText(value: string, maxLength = 420) {
  const normalized = compactText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildOpeningPrompt(character: any, otherCharacter: any, topic: string) {
  const discussionTopic =
    compactText(topic) ||
    `${character.name} and ${otherCharacter.name} are discussing their biggest ideas and disagreements.`;

  return truncatePromptText(
    `You are ${character.name} joining a live podcast with ${otherCharacter.name}. ` +
      `Open the discussion about "${discussionTopic}" in two concise spoken sentences. ` +
      `Address ${otherCharacter.name} naturally once, then stop so they can answer.`,
    760
  );
}

function buildReplyPrompt(
  character: any,
  otherCharacter: any,
  heardText: string,
  topic: string
) {
  const discussionTopic =
    compactText(topic) ||
    `${character.name} and ${otherCharacter.name} are in a live podcast discussion.`;

  return truncatePromptText(
    `You are ${character.name} in a live podcast with ${otherCharacter.name}. ` +
      `The topic is "${discussionTopic}". ` +
      `You just heard ${otherCharacter.name} say: "${truncatePromptText(heardText, 360)}" ` +
      `Respond directly to that point in two or three concise spoken sentences, then stop so ${otherCharacter.name} can reply.`,
    760
  );
}

export function PodcastRunwayStage({
  charA,
  charB,
  topic,
}: {
  charA: any;
  charB: any;
  topic: string;
}) {
  const sessionARef = useRef<PodcastLiveHostHandle | null>(null);
  const sessionBRef = useRef<PodcastLiveHostHandle | null>(null);
  const conversationTokenRef = useRef(0);
  const turnCountRef = useRef(0);
  const awaitingSpeakerRef = useRef<SpeakerId | null>(null);
  const pendingReplyRef = useRef<{
    speaker: SpeakerId;
    prompt: string;
    token: number;
  } | null>(null);
  const lastUtteranceRef = useRef<{ A: string; B: string }>({ A: "", B: "" });
  const statusRef = useRef<LiveStatus>("idle");
  const hasAutoStartedRef = useRef(false);

  const [sessionReady, setSessionReady] = useState<{ A: boolean; B: boolean }>({
    A: false,
    B: false,
  });
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [activeSpeaker, setActiveSpeaker] = useState<SpeakerId | null>(null);
  const [liveError, setLiveError] = useState("");

  const effectiveTopic =
    compactText(topic) ||
    `${charA.name} and ${charB.name} are in a live podcast conversation about their core ideas and disagreements.`;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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

  const resetConversation = useCallback((nextStatus: LiveStatus) => {
    conversationTokenRef.current += 1;
    turnCountRef.current = 0;
    awaitingSpeakerRef.current = null;
    pendingReplyRef.current = null;
    lastUtteranceRef.current = { A: "", B: "" };
    setActiveSpeaker(null);
    setStatus(nextStatus);
  }, []);

  useEffect(() => {
    return () => {
      resetConversation("idle");
    };
  }, [resetConversation]);

  useEffect(() => {
    hasAutoStartedRef.current = false;
    setLiveError("");
    resetConversation("idle");
  }, [charA.id, charB.id, effectiveTopic, resetConversation]);

  const promptSpeaker = useCallback(
    async (speaker: SpeakerId, prompt: string, token: number) => {
      if (token !== conversationTokenRef.current) return;

      const handle = getSessionHandle(speaker);
      const character = getCharacter(speaker);

      if (!handle?.isReady()) {
        throw new Error(`${character.name} is still warming up`);
      }

      awaitingSpeakerRef.current = speaker;
      setActiveSpeaker(speaker);

      if (turnCountRef.current === 0) {
        setStatus("starting");
      } else if (statusRef.current !== "paused") {
        setStatus("active");
      }

      await handle.prompt(prompt, DEFAULT_PROMPT_VOICE_ID);
    },
    [getCharacter, getSessionHandle]
  );

  const startLivePodcast = useCallback(async () => {
    if (!sessionReady.A || !sessionReady.B) {
      setLiveError("Both Runway live hosts need to be ready before the podcast can start.");
      return;
    }

    const token = conversationTokenRef.current + 1;
    conversationTokenRef.current = token;
    turnCountRef.current = 0;
    awaitingSpeakerRef.current = null;
    pendingReplyRef.current = null;
    lastUtteranceRef.current = { A: "", B: "" };

    setLiveError("");
    setActiveSpeaker("A");
    setStatus("starting");

    try {
      await promptSpeaker("A", buildOpeningPrompt(charA, charB, effectiveTopic), token);
    } catch (error: any) {
      if (token !== conversationTokenRef.current) return;
      awaitingSpeakerRef.current = null;
      setActiveSpeaker(null);
      setStatus("error");
      setLiveError(error.message || "Failed to start the Runway live podcast");
    }
  }, [charA, charB, effectiveTopic, promptSpeaker, sessionReady.A, sessionReady.B]);

  const handleUtterance = useCallback(
    (speaker: SpeakerId, text: string) => {
      const normalized = compactText(text);
      if (!normalized) return;
      if (speaker !== awaitingSpeakerRef.current) return;
      if (normalized === lastUtteranceRef.current[speaker]) return;

      lastUtteranceRef.current[speaker] = normalized;
      awaitingSpeakerRef.current = null;
      turnCountRef.current += 1;

      if (turnCountRef.current >= MAX_LIVE_TURNS) {
        setActiveSpeaker(null);
        setStatus("ended");
        return;
      }

      const nextSpeaker = speaker === "A" ? "B" : "A";
      const nextPrompt = buildReplyPrompt(
        getCharacter(nextSpeaker),
        getCharacter(speaker),
        normalized,
        effectiveTopic
      );
      const token = conversationTokenRef.current;

      if (statusRef.current === "paused") {
        pendingReplyRef.current = { speaker: nextSpeaker, prompt: nextPrompt, token };
        setActiveSpeaker(null);
        return;
      }

      void promptSpeaker(nextSpeaker, nextPrompt, token).catch((error: any) => {
        if (token !== conversationTokenRef.current) return;
        awaitingSpeakerRef.current = null;
        setActiveSpeaker(null);
        setStatus("error");
        setLiveError(error.message || "Failed to continue the Runway live podcast");
      });
    },
    [effectiveTopic, getCharacter, promptSpeaker]
  );

  const togglePaused = useCallback(async () => {
    if (statusRef.current === "paused") {
      setStatus("active");
      const pendingReply = pendingReplyRef.current;
      pendingReplyRef.current = null;
      if (!pendingReply) return;

      try {
        await promptSpeaker(pendingReply.speaker, pendingReply.prompt, pendingReply.token);
      } catch (error: any) {
        if (pendingReply.token !== conversationTokenRef.current) return;
        awaitingSpeakerRef.current = null;
        setActiveSpeaker(null);
        setStatus("error");
        setLiveError(error.message || "Failed to resume the Runway live podcast");
      }
      return;
    }

    if (statusRef.current === "starting" || statusRef.current === "active") {
      setStatus("paused");
    }
  }, [promptSpeaker]);

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
          ? activeSpeaker
            ? `${getCharacter(activeSpeaker).name} is opening`
            : "Starting live exchange"
          : status === "active"
            ? activeSpeaker
              ? `${getCharacter(activeSpeaker).name} is replying`
              : "Waiting for the next reply"
            : status === "paused"
              ? "Podcast paused"
              : status === "ended"
                ? "Podcast complete"
                : "Live orchestration error";

  useEffect(() => {
    if (!liveReady || status !== "idle" || hasAutoStartedRef.current) return;
    hasAutoStartedRef.current = true;
    void startLivePodcast();
  }, [liveReady, startLivePodcast, status]);

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col px-6 pb-6 pt-4">
      <div className="flex min-h-0 flex-1 items-center">
        <div className="grid w-full gap-5 xl:grid-cols-2">
          <PodcastLiveHostFrame
            ref={sessionARef}
            hostId="A"
            character={charA}
            topic={effectiveTopic}
            partnerName={charB.name}
            active={activeSpeaker === "A"}
            onReadyChange={handleReadyChange}
            onUtterance={handleUtterance}
          />

          <PodcastLiveHostFrame
            ref={sessionBRef}
            hostId="B"
            character={charB}
            topic={effectiveTopic}
            partnerName={charA.name}
            active={activeSpeaker === "B"}
            onReadyChange={handleReadyChange}
            onUtterance={handleUtterance}
          />
        </div>
      </div>

      <section className="mt-5 shrink-0 rounded-[28px] border border-white/80 bg-white/84 px-5 py-4 shadow-[0_24px_80px_-56px_rgba(245,158,11,0.42)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              {liveStatusLabel}
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
              Turns {turnCountRef.current} / {MAX_LIVE_TURNS}
            </div>
            {(status === "starting" || status === "active" || status === "paused") && (
              <button
                type="button"
                onClick={() => void togglePaused()}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-neutral-50"
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
                className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-neutral-50"
              >
                <RotateCcw className="h-4 w-4" />
                Restart
              </button>
            )}
          </div>
          {activeSpeaker && (
            <div className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
              {getCharacter(activeSpeaker).name}
            </div>
          )}
        </div>

        {liveError && (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
            {liveError}
          </p>
        )}
      </section>
    </div>
  );
}
