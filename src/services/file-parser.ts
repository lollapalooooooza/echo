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

function loadNodeCanvasPolyfills() {
  const runtimeRequire = Function("return require")() as NodeRequire;
  const { DOMMatrix, ImageData, Path2D } = runtimeRequire("@napi-rs/canvas");

  if (typeof (globalThis as any).DOMMatrix === "undefined") {
    (globalThis as any).DOMMatrix = DOMMatrix;
  }
  if (typeof (globalThis as any).ImageData === "undefined") {
    (globalThis as any).ImageData = ImageData;
  }
  if (typeof (globalThis as any).Path2D === "undefined") {
    (globalThis as any).Path2D = Path2D;
  }
}

async function parsePdf(buffer: Buffer, filename: string): Promise<ParseResult> {
  try {
    // pdf-parse v2 expects the PDFParse class, and Node runtimes may need
    // canvas-backed DOM polyfills before pdf.js loads.
    loadNodeCanvasPolyfills();

    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({
      data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    });

    const [textResult, infoResult] = await Promise.all([
      parser.getText(),
      parser.getInfo().catch(() => null),
    ]);

    await parser.destroy().catch(() => {});

    if (!textResult.text || textResult.text.trim().length < 10) {
      throw new Error("PDF contained no extractable text. It may be image-only or password-protected.");
    }
    return {
      text: textResult.text,
      title: infoResult?.info?.Title || filename.replace(/\.pdf$/i, ""),
      pageCount: infoResult?.total || undefined,
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
