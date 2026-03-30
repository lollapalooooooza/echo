// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");
import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require("adm-zip");

export interface ParseResult {
  text: string;
  title: string;
  pageCount?: number;
}

export async function parseFile(buffer: Buffer, filename: string): Promise<ParseResult> {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "pdf":
      return parsePdf(buffer, filename);
    case "docx":
      return parseDocx(buffer, filename);
    case "pptx":
      return parsePptx(buffer, filename);
    case "txt":
    case "md":
      return { text: buffer.toString("utf-8"), title: filename.replace(/\.\w+$/, "") };
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

async function parsePdf(buffer: Buffer, filename: string): Promise<ParseResult> {
  try {
    const data = await pdfParse(buffer);
    if (!data.text || data.text.trim().length < 10) {
      throw new Error("PDF contained no extractable text. It may be image-only or password-protected.");
    }
    return {
      text: data.text,
      title: data.info?.Title || filename.replace(/\.pdf$/i, ""),
      pageCount: data.numpages,
    };
  } catch (err: any) {
    if (err.message?.includes("no extractable text")) throw err;
    throw new Error(`Failed to parse PDF: ${err.message}`);
  }
}

async function parseDocx(buffer: Buffer, filename: string): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  if (!result.value || result.value.trim().length < 10) {
    throw new Error("DOCX contained no extractable text.");
  }
  return {
    text: result.value,
    title: filename.replace(/\.docx$/i, ""),
  };
}

async function parsePptx(buffer: Buffer, filename: string): Promise<ParseResult> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const slideTexts: string[] = [];
  const slideEntries = entries
    .filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a: any, b: any) => {
      const numA = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || "0");
      const numB = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || "0");
      return numA - numB;
    });

  for (const entry of slideEntries) {
    const xml = entry.getData().toString("utf-8");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).filter(Boolean);
    if (texts.length > 0) slideTexts.push(texts.join(" "));
  }

  if (slideTexts.length === 0) {
    throw new Error("PPTX contained no extractable text.");
  }

  return {
    text: slideTexts.join("\n\n"),
    title: filename.replace(/\.pptx$/i, ""),
    pageCount: slideTexts.length,
  };
}
