"use client";

type PreviewArgs = {
  previewKey: string;
  voiceId: string;
  text: string;
  audioUrl?: string | null;
  onStart?: (previewKey: string) => void;
  onStop?: (previewKey: string) => void;
};

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let activeController: AbortController | null = null;
let activePreviewKey = "";
let activeOnStop: ((previewKey: string) => void) | undefined;
let activeResolve: (() => void) | null = null;

function clearActivePreview(options: { notify?: boolean; settle?: "resolve" | "none" } = {}) {
  const { notify = true, settle = "resolve" } = options;
  const finishedKey = activePreviewKey;
  const finishedHandler = activeOnStop;
  const resolve = activeResolve;

  activeController?.abort();
  activeController = null;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio.load();
    activeAudio = null;
  }

  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }

  activePreviewKey = "";
  activeOnStop = undefined;
  activeResolve = null;

  if (notify && finishedKey && finishedHandler) {
    finishedHandler(finishedKey);
  }

  if (settle === "resolve") {
    resolve?.();
  }
}

export function stopVoicePreview() {
  clearActivePreview({ notify: true, settle: "resolve" });
}

export async function playVoicePreview({
  previewKey,
  voiceId,
  text,
  audioUrl,
  onStart,
  onStop,
}: PreviewArgs) {
  clearActivePreview({ notify: true, settle: "resolve" });

  const controller = new AbortController();
  activeController = controller;
  activePreviewKey = previewKey;
  activeOnStop = onStop;
  onStart?.(previewKey);

  let audio: HTMLAudioElement;

  if (audioUrl) {
    audio = new Audio(audioUrl);
  } else {
    const res = await fetch("/api/voice/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceId,
        text,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (controller.signal.aborted || activePreviewKey !== previewKey) return;

    if (!res.ok) {
      clearActivePreview({ notify: true, settle: "resolve" });
      throw new Error("Preview failed");
    }

    const buffer = await res.arrayBuffer();
    if (controller.signal.aborted || activePreviewKey !== previewKey) return;

    activeObjectUrl = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
    audio = new Audio(activeObjectUrl);
  }

  activeAudio = audio;

  await new Promise<void>((resolve, reject) => {
    activeResolve = resolve;

    const finish = () => {
      clearActivePreview({ notify: true, settle: "resolve" });
    };

    const fail = () => {
      clearActivePreview({ notify: true, settle: "none" });
      reject(new Error("Preview failed"));
    };

    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", fail, { once: true });

    audio.play().catch((error) => {
      if (controller.signal.aborted || activePreviewKey !== previewKey) {
        clearActivePreview({ notify: false, settle: "none" });
        resolve();
        return;
      }
      fail();
      reject(error);
    });
  });
}
