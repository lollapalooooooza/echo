import RunwayML from "@runwayml/sdk";

import { env } from "@/lib/env";

let client: RunwayML | null = null;

export function getRunwayClient() {
  if (!env.RUNWAY_API_KEY) {
    throw new Error("RUNWAY_API_KEY is not configured");
  }

  if (!client) {
    client = new RunwayML({
      apiKey: env.RUNWAY_API_KEY,
      timeout: 60_000,
      maxRetries: 1,
    });
  }

  return client;
}

export { RunwayML };
