import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ingestFile } from "@/services/ingestion";

export const maxDuration = 120;

const ALLOWED_EXTENSIONS = ["pdf", "docx", "pptx", "txt", "md"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_KNOWLEDGE_SOURCE_CHARS = 200_000;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: { filename: string; sourceId?: string; error?: string }[] = [];

  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      results.push({ filename: file.name, error: `Unsupported file type: .${ext}` });
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      results.push({ filename: file.name, error: "File exceeds 10MB limit" });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const sourceId = await ingestFile(buffer, file.name, userId);
      results.push({ filename: file.name, sourceId });
    } catch (err: any) {
      results.push({
        filename: file.name,
        error:
          err.message ||
          `File could not be ingested. Knowledge uploads are limited to ${MAX_KNOWLEDGE_SOURCE_CHARS.toLocaleString()} extracted characters.`,
      });
    }
  }

  const success = results.filter((r) => r.sourceId).length;
  const errors = results.filter((r) => r.error).length;

  return NextResponse.json({ results, success, errors });
}
