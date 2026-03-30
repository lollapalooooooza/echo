import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { assetId: string } }) {
  const asset = await db.uploadedAsset.findUnique({
    where: { id: params.assetId },
    select: { data: true, contentType: true },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const body = Uint8Array.from(asset.data).buffer;

  return new Response(body, {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
