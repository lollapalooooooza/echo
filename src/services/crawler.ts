// ──────────────────────────────────────────────────────────────
// Legacy crawler interface — delegates to new scraping service
// ──────────────────────────────────────────────────────────────
// Maintained for backward compatibility. New code should use
// `@/services/scraping` directly.
// ──────────────────────────────────────────────────────────────

import { scrapeUrl, discoverPages } from "@/services/scraping";

interface CrawlResult {
  title: string;
  cleanedText: string;
  url: string;
  wordCount: number;
}

/** Crawl a URL using the new scraping service. */
export async function crawlUrl(url: string): Promise<CrawlResult> {
  const result = await scrapeUrl(url, { mode: "stealth" });
  return {
    title: result.title,
    cleanedText: result.content,
    url: result.url,
    wordCount: result.wordCount,
  };
}

/** Re-export discoverPages from new scraping service. */
export { discoverPages };
