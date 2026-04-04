/**
 * PUT  /api/user/runway-key   { key: string }  — save & verify a Runway API key
 * DELETE /api/user/runway-key                   — remove the stored key
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import RunwayML from "@runwayml/sdk";

export const runtime = "nodejs";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const { key } = await req.json();

  if (!key || typeof key !== "string" || key.trim().length < 10) {
    return NextResponse.json({ error: "Invalid API key format." }, { status: 400 });
  }

  // Verify the key works by calling organization.retrieve()
  try {
    const client = new RunwayML({ apiKey: key.trim() });
    const org = await client.organization.retrieve();

    await db.user.update({
      where: { id: userId },
      data: { runwayApiKey: key.trim() },
    });

    const secondsRemaining = Math.floor(org.creditBalance * 3);
    return NextResponse.json({
      ok: true,
      creditBalance: org.creditBalance,
      secondsRemaining,
    });
  } catch (err: any) {
    const msg = err?.message || "";
    if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized") || msg.includes("authentication")) {
      return NextResponse.json({ error: "API key is invalid or unauthorised." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not verify the API key. Check it and try again." }, { status: 400 });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;

  await db.user.update({
    where: { id: userId },
    data: { runwayApiKey: null },
  });

  return NextResponse.json({ ok: true });
}
