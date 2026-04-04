/**
 * One-time cleanup: delete User rows that have no linked Account.
 * These are left by partially-completed sign-in attempts and cause
 * OAuthAccountNotLinked errors on subsequent sign-ins.
 *
 * DELETE /api/admin/cleanup-orphaned-users
 * Protected by NEXTAUTH_SECRET — pass it as ?secret=<value>
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find all users that have no Account rows at all
  const orphaned = await db.user.findMany({
    where: { accounts: { none: {} } },
    select: { id: true, email: true, createdAt: true },
  });

  if (orphaned.length === 0) {
    return NextResponse.json({ deleted: 0, users: [] });
  }

  await db.user.deleteMany({
    where: { id: { in: orphaned.map((u) => u.id) } },
  });

  return NextResponse.json({
    deleted: orphaned.length,
    users: orphaned.map((u) => ({ id: u.id, email: u.email })),
  });
}
