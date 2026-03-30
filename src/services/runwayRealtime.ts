import type RunwayML from "@runwayml/sdk";

import { getRunwayClient } from "@/services/runwayClient";

export type RunwayRealtimeSessionStatus =
  | "NOT_READY"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type RunwayRealtimeSession =
  RunwayML.RealtimeSessionRetrieveResponse;

export async function createRealtimeSession(avatarId: string, maxDuration = 300): Promise<{ id: string }> {
  const client = getRunwayClient();
  return client.realtimeSessions.create({
      model: "gwm1_avatars",
      avatar: {
        type: "custom",
        avatarId,
      },
      maxDuration,
  });
}

export async function getRealtimeSession(sessionId: string): Promise<RunwayRealtimeSession> {
  const client = getRunwayClient();
  return client.realtimeSessions.retrieve(sessionId);
}

export async function cancelRealtimeSession(sessionId: string): Promise<void> {
  const client = getRunwayClient();
  await client.realtimeSessions.delete(sessionId);
}
