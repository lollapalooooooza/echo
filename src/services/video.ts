// ──────────────────────────────────────────────────────────────
// Runway Video Character Service — Gen-3 Alpha Turbo
// ──────────────────────────────────────────────────────────────
// Generates video from character avatar for live conversation.
// - Idle video: subtle breathing/blinking loop
// - Speaking video: mouth movement and gestures
// ──────────────────────────────────────────────────────────────

import { env } from "@/lib/env";
import { toRunwayImageSource } from "@/services/runwayAssets";

const BASE = "https://api.dev.runwayml.com/v1";

function headers() {
  if (!env.RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY is not configured");
  return {
    Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
    "Content-Type": "application/json",
    "X-Runway-Version": "2024-11-06",
  };
}

export interface RunwayTask {
  id: string;
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  output?: string[];
  failure?: string;
  createdAt?: string;
}

// ── Core API Calls ──────────────────────────────────────────

/** Create an image-to-video generation task. Returns task ID. */
export async function createImageToVideo(
  imageUrl: string,
  prompt: string,
  duration: 5 | 10 = 5
): Promise<string> {
  const promptImage = await toRunwayImageSource(imageUrl);
  const imageSourceLabel = promptImage.startsWith("data:image/") ? "data-uri" : promptImage;
  console.log(`[Runway] Creating video: duration=${duration}s, image=${imageSourceLabel}, prompt="${prompt.slice(0, 60)}…"`);

  const res = await fetch(`${BASE}/image_to_video`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: "gen3a_turbo",
      promptImage,
      promptText: prompt,
      duration,
      watermark: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Runway] Create failed: ${res.status}`, body);
    throw new Error(`Runway API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  console.log(`[Runway] Task created: ${data.id}`);
  return data.id;
}

/** Get current status of a task. */
export async function getTask(taskId: string): Promise<RunwayTask> {
  const res = await fetch(`${BASE}/tasks/${taskId}`, { headers: headers() });

  if (!res.ok) {
    throw new Error(`Runway getTask ${res.status}`);
  }

  return res.json();
}

/** Cancel a running task. */
export async function cancelTask(taskId: string): Promise<void> {
  try {
    await fetch(`${BASE}/tasks/${taskId}/cancel`, { method: "POST", headers: headers() });
  } catch (e) {
    console.warn("[Runway] Cancel failed:", e);
  }
}

/** Poll until completion with exponential backoff. */
export async function waitForTask(taskId: string, maxWaitMs = 180_000): Promise<RunwayTask> {
  const startTime = Date.now();
  let pollInterval = 3000; // Start at 3s
  let consecutiveErrors = 0;

  console.log(`[Runway] Waiting for task ${taskId}…`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const task = await getTask(taskId);
      consecutiveErrors = 0;

      console.log(`[Runway] Task ${taskId}: ${task.status} (${Math.round((Date.now() - startTime) / 1000)}s)`);

      if (task.status === "SUCCEEDED") {
        console.log(`[Runway] ✓ Task completed. Output: ${task.output?.length || 0} file(s)`);
        return task;
      }

      if (task.status === "FAILED") {
        throw new Error(`Runway generation failed: ${task.failure || "Unknown reason"}`);
      }

      if (task.status === "CANCELLED") {
        throw new Error("Runway task was cancelled");
      }

    } catch (e: any) {
      consecutiveErrors++;
      if (consecutiveErrors > 5) throw e;
      console.warn(`[Runway] Poll error (attempt ${consecutiveErrors}):`, e.message);
    }

    await new Promise((r) => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.2, 10000); // Cap at 10s
  }

  // Timeout — cancel the task
  console.warn(`[Runway] Task ${taskId} timed out after ${maxWaitMs}ms, cancelling…`);
  await cancelTask(taskId);
  throw new Error(`Runway task timed out after ${Math.round(maxWaitMs / 1000)}s`);
}

// ── High-Level Video Generation ─────────────────────────────

/**
 * Generate an idle video loop for a character.
 * Shows subtle breathing, blinking, slight head movement.
 * Returns the video URL or null if generation fails / Runway not configured.
 */
export async function generateIdleVideo(avatarUrl: string): Promise<string | null> {
  if (!env.RUNWAY_API_KEY) {
    console.log("[Runway] No API key — skipping idle video");
    return null;
  }

  try {
    const taskId = await createImageToVideo(
      avatarUrl,
      "A person sitting still with subtle natural micro-movements. " +
      "Gentle blinking every few seconds. Very slight breathing motion in the chest. " +
      "Minimal head movement. Calm, relaxed expression. " +
      "Professional indoor lighting. Looking directly at camera. " +
      "Photorealistic, high quality, loopable.",
      5
    );

    const task = await waitForTask(taskId, 120_000);
    return task.output?.[0] || null;

  } catch (err) {
    console.error("[Runway] Idle video generation failed:", err);
    return null;
  }
}

/**
 * Generate a speaking video for a character.
 * Shows mouth movement, natural gestures, engaged expression.
 * Returns the video URL or null if generation fails.
 */
export async function generateSpeakingVideo(
  avatarUrl: string,
  emotionHint: string = "warm and engaged"
): Promise<string | null> {
  if (!env.RUNWAY_API_KEY) {
    console.log("[Runway] No API key — skipping speaking video");
    return null;
  }

  try {
    const taskId = await createImageToVideo(
      avatarUrl,
      `A person speaking naturally with a ${emotionHint} expression. ` +
      "Mouth clearly moving as if talking in conversation. " +
      "Subtle hand gestures. Natural head movements and nods. " +
      "Making eye contact with the camera. " +
      "Professional indoor setting. " +
      "Photorealistic, high quality, smooth motion.",
      10
    );

    const task = await waitForTask(taskId, 180_000); // Speaking vids take longer
    return task.output?.[0] || null;

  } catch (err) {
    console.error("[Runway] Speaking video generation failed:", err);
    return null;
  }
}

/**
 * Generate both idle and speaking videos in parallel.
 * Returns both URLs (either may be null if generation fails).
 */
export async function generateBothVideos(
  avatarUrl: string,
  emotionHint?: string
): Promise<{ idleVideoUrl: string | null; speakingVideoUrl: string | null }> {
  const [idle, speaking] = await Promise.allSettled([
    generateIdleVideo(avatarUrl),
    generateSpeakingVideo(avatarUrl, emotionHint),
  ]);

  return {
    idleVideoUrl: idle.status === "fulfilled" ? idle.value : null,
    speakingVideoUrl: speaking.status === "fulfilled" ? speaking.value : null,
  };
}
