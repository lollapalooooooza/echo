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

  const bytes = Uint8Array.from(asset.data);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  return new Response(body, {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
