"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ExternalLink, X } from "lucide-react";
import { useRoomContext, useTranscriptions } from "@livekit/components-react";

import { cn } from "@/lib/utils";

type RoomTheme = "light" | "dark";

type OverlayArticle = {
  sourceId: string;
  title: string;
  url: string;
  excerpt: string;
  topic?: string | null;
  publishDate?: string | null;
  reason: string;
  ctaLabel: string;
};

const ARTICLE_HINT_PATTERN =
  /\b(article|post|blog|source|link|read|reading|essay|newsletter|write[- ]?up|piece|interview|show me|open|send me|where can i read|which article|which post|original)\b|文章|原文|链接|出处/i;

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function RunwayLiveOverlays({
  character,
  theme,
}: {
  character: any;
  theme: RoomTheme;
}) {
  const room = useRoomContext();
  const transcriptions = useTranscriptions({ room });
  const [article, setArticle] = useState<OverlayArticle | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  const timerRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const lastProcessedKeyRef = useRef("");
  const requestSeqRef = useRef(0);

  const isLight = theme === "light";
  const localIdentity = room.localParticipant.identity;

  const latestStreams = useMemo(() => {
    const ordered = [...transcriptions].sort(
      (left, right) => left.streamInfo.timestamp - right.streamInfo.timestamp
    );

    const latestUser = [...ordered].reverse().find((item) => item.participantInfo.identity === localIdentity) || null;
    const latestAgent = [...ordered].reverse().find((item) => item.participantInfo.identity !== localIdentity) || null;

    return { latestUser, latestAgent };
  }, [localIdentity, transcriptions]);

  const captionText = compactText(latestStreams.latestAgent?.text);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const latestUser = latestStreams.latestUser;
    const utterance = compactText(latestUser?.text);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!latestUser || utterance.length < 16 || !ARTICLE_HINT_PATTERN.test(utterance)) {
      return;
    }

    const requestKey = `${latestUser.streamInfo.id}:${utterance}`;
    if (lastProcessedKeyRef.current === requestKey) {
      return;
    }

    timerRef.current = window.setTimeout(async () => {
      lastProcessedKeyRef.current = requestKey;
      const requestId = ++requestSeqRef.current;
      setArticleLoading(true);

      try {
        const response = await fetch("/api/runway/article-overlay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            utterance,
          }),
        });

        const payload = await response.json().catch(() => null);
        if (requestId !== requestSeqRef.current) return;

        if (!response.ok || !payload?.shouldShow || !payload?.article?.url) {
          return;
        }

        setArticle(payload.article as OverlayArticle);

        if (dismissTimerRef.current) {
          window.clearTimeout(dismissTimerRef.current);
        }
        dismissTimerRef.current = window.setTimeout(() => {
          setArticle((current) =>
            current?.sourceId === payload.article.sourceId ? null : current
          );
        }, 18000);
      } catch (error) {
        console.warn("[RunwayLiveOverlays] Failed to resolve article overlay:", error);
      } finally {
        if (requestId === requestSeqRef.current) {
          setArticleLoading(false);
        }
      }
    }, 1200);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [character.id, latestStreams.latestUser?.streamInfo.id, latestStreams.latestUser?.text]);

  return (
    <>
      {article && (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex justify-end sm:inset-x-6 sm:top-6">
          <div
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-[24px] border p-4 shadow-2xl backdrop-blur-2xl",
              isLight
                ? "border-white/85 bg-white/74 shadow-amber-200/50"
                : "border-white/12 bg-black/42 shadow-black/45"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl",
                  isLight ? "bg-amber-100 text-amber-700" : "bg-white/10 text-amber-100"
                )}
              >
                <BookOpen className="h-4.5 w-4.5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className={cn("text-[11px] font-semibold uppercase tracking-[0.22em]", isLight ? "text-amber-700/70" : "text-amber-100/70")}>
                  Article bubble
                </p>
                <p className={cn("mt-2 text-sm font-semibold leading-5", isLight ? "text-slate-900" : "text-white")}>
                  {article.title}
                </p>
                <p className={cn("mt-2 text-xs leading-5", isLight ? "text-slate-600" : "text-white/68")}>
                  {article.reason}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium",
                      isLight ? "bg-slate-100 text-slate-500" : "bg-white/10 text-white/55"
                    )}
                  >
                    {getHostname(article.url)}
                  </span>
                  {article.topic && (
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium",
                        isLight ? "bg-amber-50 text-amber-700" : "bg-amber-300/10 text-amber-100/80"
                      )}
                    >
                      {article.topic}
                    </span>
                  )}
                </div>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    isLight
                      ? "bg-slate-900 text-white hover:bg-slate-700"
                      : "bg-white text-slate-900 hover:bg-white/90"
                  )}
                >
                  {article.ctaLabel}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <button
                type="button"
                onClick={() => setArticle(null)}
                className={cn(
                  "inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors",
                  isLight ? "bg-slate-100 text-slate-500 hover:text-slate-900" : "bg-white/10 text-white/50 hover:text-white"
                )}
                aria-label="Dismiss article bubble"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {(captionText || articleLoading) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-6">
          <div className="w-full max-w-3xl">
            {articleLoading && (
              <div className="mb-3 flex justify-center">
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl",
                    isLight ? "bg-white/75 text-slate-500" : "bg-black/45 text-white/60"
                  )}
                >
                  <span className="live-dot" style={{ width: 6, height: 6 }} />
                  Looking for the exact article…
                </div>
              </div>
            )}

            {captionText && (
              <div className="relative overflow-hidden rounded-[28px]">
                <div
                  className={cn(
                    "absolute inset-0",
                    isLight
                      ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.74)_24%,rgba(255,255,255,0.74)_76%,rgba(255,255,255,0.18))]"
                      : "bg-[linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.58)_24%,rgba(0,0,0,0.58)_76%,rgba(0,0,0,0.12))]"
                  )}
                />
                <div
                  className={cn(
                    "absolute inset-x-0 top-0 h-12",
                    isLight ? "bg-gradient-to-b from-[#f8f6f1] via-[#f8f6f1]/82 to-transparent" : "bg-gradient-to-b from-black/70 to-transparent"
                  )}
                />
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-12",
                    isLight ? "bg-gradient-to-t from-[#f8f6f1] via-[#f8f6f1]/82 to-transparent" : "bg-gradient-to-t from-black/70 to-transparent"
                  )}
                />
                <div
                  className={cn(
                    "relative px-6 py-4 text-center text-[1rem] font-medium leading-7 sm:text-[1.16rem]",
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  {captionText}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
