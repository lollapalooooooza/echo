import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";

export async function rateLimit(
  req: NextRequest,
  opts: { userId?: string; sessionId?: string; endpoint: string; limit?: number; windowMs?: number }
): Promise<{ allowed: boolean; remaining: number }> {
  const limit = opts.limit ?? env.RATE_LIMIT_PER_MINUTE;
  const windowMs = opts.windowMs ?? 60_000;
  const since = new Date(Date.now() - windowMs);

  const where: any = { endpoint: opts.endpoint, timestamp: { gte: since } };
  if (opts.userId) where.userId = opts.userId;
  else if (opts.sessionId) where.sessionId = opts.sessionId;
  else {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    where.sessionId = `ip:${ip}`;
    opts.sessionId = `ip:${ip}`;
  }

  const count = await db.usageRecord.count({ where });

  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  await db.usageRecord.create({
    data: { userId: opts.userId, sessionId: opts.sessionId, endpoint: opts.endpoint },
  });

  return { allowed: true, remaining: limit - count - 1 };
}

export function rateLimitResponse(remaining: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded. Please try again later." },
    { status: 429, headers: { "X-RateLimit-Remaining": String(remaining), "Retry-After": "60" } }
  );
}
