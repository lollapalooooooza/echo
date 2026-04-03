"use client";

import { consumeSession } from "@runwayml/avatars-react/api";
import type { SessionCredentials } from "@runwayml/avatars-react";

const POLL_TIMEOUT_MS = 60_000;
const INITIAL_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 2_000;

export type CreateSessionResult = {
  sessionId: string;
  credentials: SessionCredentials;
  clientEventsEnabled: boolean;
};

/**
 * Create a Runway realtime session and wait for it to be ready.
 *
 * 1. POST /api/runway/realtime-session → creates session, returns { sessionId }
 * 2. Polls GET /api/runway/realtime-session?sessionId=… until READY
 * 3. Calls the SDK's consumeSession() to get WebRTC credentials
 *
 * All polling happens client-side to avoid Vercel function timeouts.
 */
export async function createAndConsumeSession(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<CreateSessionResult> {
  // Step 1 — Create
  const createRes = await fetch("/api/runway/realtime-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const createData = await createRes.json();
  if (!createRes.ok) {
    throw new Error(createData.error || "Failed to create Runway session");
  }

  const { sessionId, clientEventsEnabled } = createData as {
    sessionId: string;
    clientEventsEnabled: boolean;
  };

  if (!sessionId) {
    throw new Error("No sessionId returned from server");
  }

  // Step 2 — Poll for READY
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let pollInterval = INITIAL_POLL_INTERVAL_MS;
  let sessionKey: string | null = null;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Aborted");

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL_MS);

    if (signal?.aborted) throw new Error("Aborted");

    const pollRes = await fetch(
      `/api/runway/realtime-session?sessionId=${encodeURIComponent(sessionId)}`,
      { signal }
    );
    const pollData = await pollRes.json();

    if (!pollRes.ok) {
      // Server error polling — continue trying
      console.warn("[runway-session] Poll error:", pollData.error);
      continue;
    }

    const status = pollData.session?.status;

    if (status === "READY") {
      sessionKey = pollData.session.sessionKey;
      break;
    }

    if (status === "FAILED") {
      throw new Error(
        pollData.session.failure || "Runway session failed to start"
      );
    }

    if (status === "CANCELLED" || status === "COMPLETED") {
      throw new Error(
        `Runway session ${status.toLowerCase()} before it could connect`
      );
    }

    if (status === "RUNNING") {
      throw new Error(
        "Runway session was already consumed by another client"
      );
    }

    // NOT_READY or unknown — keep polling
  }

  if (!sessionKey) {
    throw new Error(
      "Runway session timed out — it never became ready. This can happen when Runway is under heavy load. Please try again."
    );
  }

  // Step 3 — Consume (client-side, via SDK)
  const { url, token, roomName } = await consumeSession({
    sessionId,
    sessionKey,
  });

  return {
    sessionId,
    credentials: {
      sessionId,
      serverUrl: url,
      token,
      roomName,
    },
    clientEventsEnabled: !!clientEventsEnabled,
  };
}
