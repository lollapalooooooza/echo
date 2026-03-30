import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("avatar") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
    }

    const asset = await db.uploadedAsset.create({
      data: {
        userId,
        kind: "avatar",
        contentType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
      },
      select: { id: true },
    });

    const baseUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.json({ avatarUrl: `${baseUrl}/api/assets/${asset.id}` });
  } catch (error: any) {
    console.error("[Upload Avatar] Error:", error);
    return NextResponse.json({ error: error?.message || "Failed to upload avatar" }, { status: 500 });
  }
}
