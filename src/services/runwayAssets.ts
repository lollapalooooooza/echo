import { readFile } from "fs/promises";
import path from "path";

import { env } from "@/lib/env";

const APP_ORIGINS = [env.NEXT_PUBLIC_APP_URL, env.NEXTAUTH_URL]
  .map((value) => {
    if (!value) return null;
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  })
  .filter((value): value is string => Boolean(value));

function mimeTypeFor(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function resolveLocalAssetPath(imageUrl: string) {
  let pathname = imageUrl;

  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol === "https:") return null;

    const isKnownLocalOrigin =
      parsed.origin.startsWith("http://localhost") ||
      parsed.origin.startsWith("http://127.0.0.1") ||
      APP_ORIGINS.includes(parsed.origin);

    if (!isKnownLocalOrigin) {
      throw new Error(`Runway requires an HTTPS, Runway, or data URI image. Received unsupported avatar URL: ${imageUrl}`);
    }

    pathname = parsed.pathname;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Runway requires")) {
      throw error;
    }
  }

  const normalizedPath = path.posix.normalize(pathname.startsWith("/") ? pathname : `/${pathname}`);
  if (normalizedPath.startsWith("/..")) {
    throw new Error("Avatar path resolves outside the public directory");
  }

  const publicDir = path.join(process.cwd(), "public");
  const resolvedPublicDir = path.resolve(publicDir);
  const filePath = path.join(publicDir, normalizedPath.replace(/^\/+/, ""));
  const resolvedFilePath = path.resolve(filePath);

  if (!resolvedFilePath.startsWith(`${resolvedPublicDir}${path.sep}`) && resolvedFilePath !== resolvedPublicDir) {
    throw new Error("Avatar path resolves outside the public directory");
  }

  return resolvedFilePath;
}

export async function toRunwayImageSource(imageUrl: string) {
  if (
    imageUrl.startsWith("https://") ||
    imageUrl.startsWith("runway://") ||
    imageUrl.startsWith("data:image/")
  ) {
    return imageUrl;
  }

  const localAssetPath = resolveLocalAssetPath(imageUrl);
  if (!localAssetPath) {
    throw new Error(`Runway requires an HTTPS, Runway, or data URI image. Received unsupported avatar URL: ${imageUrl}`);
  }

  const image = await readFile(localAssetPath);
  return `data:${mimeTypeFor(localAssetPath)};base64,${image.toString("base64")}`;
}
