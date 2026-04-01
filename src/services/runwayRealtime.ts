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

export async function createRealtimeSession(
  avatarId: string,
  maxDuration = 300,
  options?: { enableClientEvents?: boolean }
): Promise<{ id: string }> {
  const client = getRunwayClient();
  const params = {
    model: "gwm1_avatars",
    avatar: {
      type: "custom" as const,
      avatarId,
    },
    maxDuration,
    ...(options?.enableClientEvents ? { tools: runwayClientEventTools } : {}),
  };

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
