import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getUserProfile, updateUserProfile } from "@/services/user";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserProfile(userId);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const user = await updateUserProfile(userId, {
      name: typeof body?.name === "string" ? body.name : undefined,
      username: typeof body?.username === "string" ? body.username : undefined,
      bio: typeof body?.bio === "string" ? body.bio : undefined,
    });

    return NextResponse.json(user);
  } catch (error: any) {
    const message = error?.message || "Failed to update user";
    const status = message === "User not found" ? 404 : message.includes("taken") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
