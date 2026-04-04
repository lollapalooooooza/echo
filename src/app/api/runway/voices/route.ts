import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getRunwayClient } from "@/services/runwayClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/runway/voices
 * Fetches all custom voices for the authenticated org from the Runway API.
 * Returns an array of { id, name, description, previewUrl, status } objects.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = getRunwayClient();

    // Collect all pages via cursor-based pagination
    const voices: Array<{
      id: string;
      name: string;
      description: string | null;
      previewUrl: string | null;
      status: "READY" | "PROCESSING" | "FAILED";
      createdAt: string;
    }> = [];

    // voices.list() returns a PagePromise with async iterator support — auto-paginates
    for await (const voice of client.voices.list({})) {
      voices.push({
        id: voice.id,
        name: voice.name,
        description: voice.description ?? null,
        previewUrl: voice.status === "READY" ? (voice as any).previewUrl ?? null : null,
        status: voice.status as "READY" | "PROCESSING" | "FAILED",
        createdAt: voice.createdAt,
      });
    }

    return NextResponse.json({ voices });
  } catch (err: any) {
    // If no API key or Runway is unavailable, return gracefully
    if (err?.message?.includes("RUNWAY_API_KEY")) {
      return NextResponse.json({ voices: [], unavailable: true });
    }
    console.error("[RunwayVoices] Failed to list voices:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch Runway voices" },
      { status: 500 }
    );
  }
}
