"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Radio, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

type SpeakerId = "A" | "B";

export type PodcastLiveHostHandle = {
  isReady: () => boolean;
  prompt: (text: string, voiceId?: string) => Promise<void>;
};

type HostStatusMessage = {
  type: "podcast-host-status";
  hostId: SpeakerId;
  ready: boolean;
  error?: string | null;
};

type HostPromptResultMessage = {
  type: "podcast-host-prompt-result";
  hostId: SpeakerId;
  requestId: string;
  ok: boolean;
  error?: string;
};

type HostUtteranceMessage = {
  type: "podcast-host-utterance";
  hostId: SpeakerId;
  text: string;
};

function isHostStatusMessage(value: unknown): value is HostStatusMessage {
  return !!value && typeof value === "object" && (value as any).type === "podcast-host-status";
}

function isHostPromptResultMessage(value: unknown): value is HostPromptResultMessage {
  return !!value && typeof value === "object" && (value as any).type === "podcast-host-prompt-result";
}

function isHostUtteranceMessage(value: unknown): value is HostUtteranceMessage {
  return !!value && typeof value === "object" && (value as any).type === "podcast-host-utterance";
}

export const PodcastLiveHostFrame = forwardRef<
  PodcastLiveHostHandle,
  {
    hostId: SpeakerId;
    character: any;
    topic: string;
    partnerName: string;
    active: boolean;
    onReadyChange: (speaker: SpeakerId, ready: boolean) => void;
    onUtterance: (speaker: SpeakerId, text: string) => void;
  }
>(function PodcastLiveHostFrame(
  { hostId, character, topic, partnerName, active, onReadyChange, onUtterance },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingRequestsRef = useRef(
    new Map<
      string,
      {
        resolve: () => void;
        reject: (error: Error) => void;
        timeoutId: number;
      }
    >()
  );
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [frameError, setFrameError] = useState("");

  const frameSrc = useMemo(() => {
    const params = new URLSearchParams({
      characterId: character.id,
      host: hostId,
      attempt: String(attempt),
      topic,
      partnerName,
    });
    return `/podcast/live-host?${params.toString()}`;
  }, [attempt, character.id, hostId, partnerName, topic]);

  useEffect(() => {
    setReady(false);
    setFrameError("");
    onReadyChange(hostId, false);
  }, [frameSrc, hostId, onReadyChange]);

  useEffect(() => {
    const expectedOrigin = window.location.origin;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;

      if (isHostStatusMessage(event.data) && event.data.hostId === hostId) {
        const nextReady = !!event.data.ready;
        setReady(nextReady);
        setFrameError(event.data.error || "");
        onReadyChange(hostId, nextReady);
        return;
      }

      if (isHostPromptResultMessage(event.data) && event.data.hostId === hostId) {
        const pending = pendingRequestsRef.current.get(event.data.requestId);
        if (!pending) return;

        window.clearTimeout(pending.timeoutId);
        pendingRequestsRef.current.delete(event.data.requestId);
        if (event.data.ok) {
          pending.resolve();
        } else {
          pending.reject(new Error(event.data.error || "Failed to play live prompt"));
        }
      }

      if (isHostUtteranceMessage(event.data) && event.data.hostId === hostId) {
        onUtterance(hostId, event.data.text);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [hostId, onReadyChange, onUtterance]);

  useEffect(() => {
    return () => {
      pendingRequestsRef.current.forEach((pending) => {
        window.clearTimeout(pending.timeoutId);
        pending.reject(new Error("Live host frame was unmounted"));
      });
      pendingRequestsRef.current.clear();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      isReady: () => ready,
      prompt: (text: string, voiceId?: string) => {
        const iframeWindow = iframeRef.current?.contentWindow;
        if (!iframeWindow || !ready) {
          return Promise.reject(new Error(`${character.name} is still warming up`));
        }

        const requestId = `host-${hostId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        return new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            pendingRequestsRef.current.delete(requestId);
            reject(new Error(`${character.name} did not acknowledge the live prompt in time`));
          }, 30000);

          pendingRequestsRef.current.set(requestId, { resolve, reject, timeoutId });
          iframeWindow.postMessage(
            {
              type: "podcast-host-prompt",
              hostId,
              requestId,
              text,
              voiceId: voiceId || null,
            },
            window.location.origin
          );
        });
      },
    }),
    [character.name, hostId, ready]
  );

  return (
    <section
      className={cn(
        "flex min-h-[30rem] flex-col rounded-[28px] border bg-[#fcfaf6] p-3 transition-colors duration-300",
        active ? "border-[#efb36c]" : "border-[#e8dfd1]"
      )}
    >
      <div className="flex items-center justify-between gap-3 px-1 pb-3 pt-1">
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
          <div className="min-w-0">
            <p
              className="truncate text-lg font-semibold tracking-tight text-slate-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {character.name}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
            ready
              ? "bg-[#ebf7ef] text-[#227a45]"
              : frameError
                ? "bg-rose-50 text-rose-700"
                : "bg-[#f7f0e3] text-[#996026]"
          )}
        >
          {ready ? "Live" : frameError ? "Issue" : "Warming"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-[22px] bg-[#efe8dd]">
        {frameError ? (
          <div className="flex h-full min-h-[24rem] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f5e6cf] text-[#996026]">
              <Radio className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#996026]">
              Live unavailable
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">{frameError}</p>
            <button
              type="button"
              onClick={() => setAttempt((current) => current + 1)}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
              Retry live session
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            key={frameSrc}
            src={frameSrc}
            title={`${character.name} live host`}
            allow="autoplay; microphone"
            className="h-full min-h-[24rem] w-full overflow-hidden border-0 bg-black"
          />
        )}
      </div>
    </section>
  );
});
