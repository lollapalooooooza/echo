import type RunwayML from "@runwayml/sdk";

import { runwayClientEventTools } from "@/lib/runway-client-events";
import { getRunwayClient } from "@/services/runwayClient";

const RUNWAY_BASE_URL = "https://api.dev.runwayml.com";

export type RunwayRealtimeSessionStatus =
  | "NOT_READY"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type RunwayRealtimeSession =
  RunwayML.RealtimeSessionRetrieveResponse;

export type RunwayRealtimeSessionCredentials = {
  url: string;
  token: string;
  roomName: string;
};

export type CreateRealtimeSessionOptions = {
  enableClientEvents?: boolean;
  personality?: string;
  startScript?: string;
};

function normalizeSessionOverride(value: string | undefined, maxChars: number) {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxChars);
}

export async function createRealtimeSession(
  avatarId: string,
  maxDuration = 300,
  options?: CreateRealtimeSessionOptions
): Promise<{ id: string }> {
  const client = getRunwayClient();
  const params: Record<string, unknown> = {
    model: "gwm1_avatars",
    avatar: {
      type: "custom" as const,
      avatarId,
    },
    maxDuration,
  };
  const personality = normalizeSessionOverride(options?.personality, 1800);
  const startScript = normalizeSessionOverride(options?.startScript, 1800);

  // Only send overrides if explicitly provided — otherwise let
  // the avatar's own config on Runway (voice, personality, etc.) take effect.
  if (personality) {
    params.personality = personality;
  }
  if (startScript) {
    params.startScript = startScript;
  }
  if (options?.enableClientEvents) {
    params.tools = runwayClientEventTools;
  }

  console.log(`[runway-realtime] Creating session for avatar ${avatarId}`, {
    maxDuration,
    hasPersonality: !!params.personality,
    hasStartScript: !!params.startScript,
    hasTools: !!params.tools,
  });

  return client.realtimeSessions.create(params as any);
}

export async function getRealtimeSession(sessionId: string): Promise<RunwayRealtimeSession> {
  const client = getRunwayClient();
  return client.realtimeSessions.retrieve(sessionId);
}

export async function consumeRealtimeSession(
  sessionId: string,
  sessionKey: string
): Promise<RunwayRealtimeSessionCredentials> {
  const response = await fetch(`${RUNWAY_BASE_URL}/v1/realtime_sessions/${sessionId}/consume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to consume realtime session: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function cancelRealtimeSession(sessionId: string): Promise<void> {
  const client = getRunwayClient();
  await client.realtimeSessions.delete(sessionId);
}
