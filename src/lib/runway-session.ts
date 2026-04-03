"use client";

import { consumeSession } from "@runwayml/avatars-react/api";
import type { SessionCredentials } from "@runwayml/avatars-react";

const POLL_TIMEOUT_MS = 120_000; // 2 minutes — Runway can be slow
const INITIAL_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 2_000;

export type CreateSessionResult = {
  sessionId: string;
  credentials: SessionCredentials;
  clientEventsEnabled: boolean;
};

/**
 * Create a Runway realtime session and obtain WebRTC credentials.
 *
 * The server POST may return one of three shapes:
 *
 * 1. **Full credentials** (serverUrl, token, roomName) — session was
 *    consumed server-side, ready immediately.
 * 2. **sessionId + sessionKey** — session is READY but wasn't consumed
 *    yet; call the SDK's `consumeSession()` client-side.
 * 3. **sessionId only** — session is still provisioning; poll GET until
 *    READY, then consume client-side.
 *
 * All client-side polling happens here to avoid Vercel function timeouts.
 */
export async function createAndConsumeSession(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<CreateSessionResult> {
  // Step 1 — Create (server may also poll and return credentials)
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

  const {
    sessionId,
    clientEventsEnabled,
    serverUrl,
    token,
    roomName,
    sessionKey: immediateKey,
  } = createData as {
    sessionId: string;
    clientEventsEnabled: boolean;
    serverUrl?: string;
    token?: string;
    roomName?: string;
    sessionKey?: string;
  };

  if (!sessionId) {
    throw new Error("No sessionId returned from server");
  }

  // Case 1 — Server returned full WebRTC credentials
  if (serverUrl && token && roomName) {
    return {
      sessionId,
      credentials: { sessionId, serverUrl, token, roomName },
      clientEventsEnabled: !!clientEventsEnabled,
    };
  }

  // Case 2 — Server returned sessionKey; consume client-side
  if (immediateKey) {
    const { url, token: t, roomName: rn } = await consumeSession({
      sessionId,
      sessionKey: immediateKey,
    });
    return {
      sessionId,
      credentials: { sessionId, serverUrl: url, token: t, roomName: rn },
      clientEventsEnabled: !!clientEventsEnabled,
    };
  }

  // Case 3 — Need to poll for READY
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

  // Consume client-side via SDK
  const { url, token: t, roomName: rn } = await consumeSession({
    sessionId,
    sessionKey,
  });

  return {
    sessionId,
    credentials: {
      sessionId,
      serverUrl: url,
      token: t,
      roomName: rn,
    },
    clientEventsEnabled: !!clientEventsEnabled,
  };
}
