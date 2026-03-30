// ──────────────────────────────────────────────────────────────
// Scraping Service — Adaptive web scraping abstraction layer
// ──────────────────────────────────────────────────────────────
// Provides a unified interface for web scraping with multiple backends:
// 1. Scrapling (Python subprocess) — adaptive, stealth, dynamic rendering
// 2. Firecrawl API — managed scraping service
// 3. Native fetch — basic HTML fetching with cleaning
// ──────────────────────────────────────────────────────────────

import { env } from "@/lib/env";
import type { ScrapeResult, ScrapeOptions } from "@/types";

// ── Configuration ────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30000;
const DISCOVERY_TIMEOUT = 12000;
const MAX_SITEMAP_FETCHES = 12;
const SITEMAP_CANDIDATE_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"];

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// ── Main Scraping Interface ──────────────────────────────────

/**
 * Scrape a single URL with automatic fallback chain:
 * Scrapling (if available) → Firecrawl (if configured) → Native fetch
 */
export async function scrapeUrl(
  url: string,
  options: Partial<ScrapeOptions> = {}
): Promise<ScrapeResult> {
  const opts: ScrapeOptions = {
    mode: options.mode || "stealth",
    timeout: options.timeout || DEFAULT_TIMEOUT,
    extractMainContent: options.extractMainContent ?? true,
    convertToMarkdown: options.convertToMarkdown ?? true,
  };

  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Try Scrapling first (Python subprocess)
  try {
    const result = await scraplingFetch(url, opts);
    if (result && result.content.length > 50) {
      console.log(`[Scrape] ✓ Scrapling (${opts.mode}): ${url}`);
      return result;
    }
  } catch (e: any) {
    console.warn(`[Scrape] Scrapling failed for ${url}: ${e.message}`);
  }

  // Try Firecrawl
  if (env.FIRECRAWL_API_KEY) {
    try {
      const result = await firecrawlFetch(url, opts);
      if (result && result.content.length > 50) {
        console.log(`[Scrape] ✓ Firecrawl: ${url}`);
        return result;
      }
    } catch (e: any) {
      console.warn(`[Scrape] Firecrawl failed for ${url}: ${e.message}`);
    }
  }

  // Fallback to native
  console.log(`[Scrape] Falling back to native fetch: ${url}`);
  return nativeFetch(url, opts);
}

/**
 * Scrape multiple URLs in batch with concurrency control
 */
export async function scrapeBatch(
  urls: string[],
  options: Partial<ScrapeOptions> = {},
  concurrency = 3
): Promise<{ results: ScrapeResult[]; errors: { url: string; error: string }[] }> {
  const results: ScrapeResult[] = [];
  const errors: { url: string; error: string }[] = [];
  const queue = [...urls];

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift()!;
      try {
        const result = await scrapeUrl(url, options);
        results.push(result);
      } catch (e: any) {
        errors.push({ url, error: e.message });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));
  return { results, errors };
}

/**
 * Discover and crawl all pages from a website
 */
export async function crawlWebsite(
  baseUrl: string,
  options: { maxPages?: number; mode?: ScrapeOptions["mode"] } = {}
): Promise<{ results: ScrapeResult[]; errors: { url: string; error: string }[]; totalDiscovered: number }> {
  const maxPages = options.maxPages || 30;
  const urls = await discoverPages(baseUrl, maxPages);
  console.log(`[Scrape] Discovered ${urls.length} pages on ${new URL(baseUrl).hostname}`);
  const { results, errors } = await scrapeBatch(urls, { mode: options.mode || "stealth" });
  return { results, errors, totalDiscovered: urls.length };
}

/**
 * Discover pages from a website for crawling
 */
export async function discoverPages(baseUrl: string, maxPages = 30): Promise<string[]> {
  const discoveryLimit = Math.max(maxPages * 4, 60);
  const [sitemapUrls, firecrawlUrls, nativeUrls] = await Promise.all([
    discoverPagesFromSitemaps(baseUrl, discoveryLimit),
    discoverPagesWithFirecrawl(baseUrl, discoveryLimit),
    nativeDiscoverPages(baseUrl, Math.max(maxPages * 2, 20)),
  ]);

  const merged = Array.from(new Set([...sitemapUrls, ...firecrawlUrls, ...nativeUrls]));
  const prioritized = prioritizeDiscoveredUrls(merged, baseUrl).slice(0, maxPages);

  if (prioritized.length > 0) {
    return prioritized;
  }

  return [normalizeDiscoveredUrl(baseUrl)];
}

// ── Scrapling Backend (Python subprocess) ────────────────────

async function scraplingFetch(url: string, opts: ScrapeOptions): Promise<ScrapeResult> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const script = `
import json, sys
try:
    from scrapling import Fetcher, StealthyFetcher, PlayWrightFetcher
except ImportError:
    print(json.dumps({"error": "scrapling not installed"}))
    sys.exit(0)

url = sys.argv[1]
mode = sys.argv[2]

try:
    if mode == "dynamic":
        fetcher = PlayWrightFetcher()
        page = fetcher.fetch(url, headless=True, timeout=${opts.timeout})
    elif mode == "stealth":
        fetcher = StealthyFetcher()
        page = fetcher.fetch(url)
    else:
        fetcher = Fetcher()
        page = fetcher.fetch(url)

    # Extract structured data
    title = ""
    title_el = page.css_first("title")
    if title_el:
        title = title_el.text()
    if not title:
        og = page.css_first('meta[property="og:title"]')
        if og:
            title = og.attrib.get("content", "")
    if not title:
        h1 = page.css_first("h1")
        if h1:
            title = h1.text()

    # Extract headings
    headings = []
    for level in range(1, 7):
        for h in page.css(f"h{level}"):
            text = h.text().strip()
            if text:
                headings.append({"level": level, "text": text[:200]})

    # Extract publish date
    publish_date = None
    for selector in ['meta[property="article:published_time"]', 'time[datetime]', 'meta[name="date"]']:
        el = page.css_first(selector)
        if el:
            publish_date = el.attrib.get("content") or el.attrib.get("datetime")
            if publish_date:
                break

    # Extract main content — remove noise
    for sel in ["nav", "footer", "header", "aside", ".sidebar", ".ad", ".advertisement",
                 ".cookie-banner", ".newsletter-signup", "script", "style", "noscript"]:
        for el in page.css(sel):
            el.remove()

    # Try main content areas
    main = page.css_first("main") or page.css_first("article") or page.css_first('[role="main"]')
    if main:
        content = main.text(separator="\\n\\n")
    else:
        body = page.css_first("body")
        content = body.text(separator="\\n\\n") if body else page.text(separator="\\n\\n")

    # Clean content
    lines = [line.strip() for line in content.split("\\n") if line.strip()]
    content = "\\n\\n".join(lines)

    result = {
        "url": url,
        "title": title.strip(),
        "content": content,
        "publishDate": publish_date,
        "headings": headings[:50],
        "wordCount": len(content.split()),
        "method": f"scrapling_{mode}"
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;

  try {
    const { stdout } = await execFileAsync("python3", ["-c", script, url, opts.mode], {
      timeout: opts.timeout! + 5000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const data = JSON.parse(stdout.trim());
    if (data.error) throw new Error(data.error);

    return {
      url: data.url,
      title: data.title || extractTitleFromUrl(url),
      content: data.content,
      markdown: convertToMarkdown(data.content, data.headings || []),
      publishDate: data.publishDate || null,
      headings: data.headings || [],
      wordCount: data.wordCount || data.content.split(/\s+/).length,
      fetchMethod: data.method as ScrapeResult["fetchMethod"],
    };
  } catch (e: any) {
    if (e.message?.includes("scrapling not installed")) {
      throw new Error("Scrapling Python package not available");
    }
    throw e;
  }
}

// ── Firecrawl Backend ────────────────────────────────────────

async function firecrawlFetch(url: string, opts: ScrapeOptions): Promise<ScrapeResult> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: opts.extractMainContent,
      timeout: opts.timeout,
    }),
  });

  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const markdown = data.data?.markdown || "";
  const title = data.data?.metadata?.title || extractTitleFromUrl(url);
  const publishDate = data.data?.metadata?.publishedTime || null;

  if (markdown.length < 50) throw new Error("Firecrawl returned too little content");

  return {
    url,
    title,
    content: markdown,
    markdown,
    publishDate,
    headings: extractHeadingsFromMarkdown(markdown),
    wordCount: markdown.split(/\s+/).length,
    fetchMethod: "firecrawl",
  };
}

// ── Native Fetch Backend ─────────────────────────────────────

async function nativeFetch(url: string, opts: ScrapeOptions, retries = 2): Promise<ScrapeResult> {
  let lastError: Error = new Error("Unknown");

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeout || DEFAULT_TIMEOUT);

      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (res.status === 403 || res.status === 429) {
        throw new Error(
          `Site blocked access (HTTP ${res.status}). The site may require authentication or block automated access.`
        );
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

      const contentType = res.headers.get("content-type") || "";
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("text/plain") &&
        !contentType.includes("application/xhtml")
      ) {
        throw new Error(`Non-HTML content type: ${contentType}`);
      }

      const html = await res.text();
      if (html.length < 100) throw new Error("Page too short");

      const title = extractTitleFromHtml(html) || extractTitleFromUrl(url);
      const content = cleanHtml(html);
      const headings = extractHeadingsFromHtml(html);
      const publishDate = extractPublishDate(html);

      if (content.length < 50) throw new Error("Not enough text content after cleaning");

      return {
        url,
        title,
        content,
        markdown: convertToMarkdown(content, headings),
        publishDate,
        headings,
        wordCount: content.split(/\s+/).length,
        fetchMethod: "native",
      };
    } catch (e: any) {
      lastError = e;
      if (e.message?.includes("blocked access")) throw e;
      if (attempt < retries) {
        console.log(`[Scrape] Attempt ${attempt + 1} failed for ${url}: ${e.message}. Retrying...`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error(`Failed to scrape ${url} after ${retries + 1} attempts: ${lastError.message}`);
}

// ── Native Link Discovery ────────────────────────────────────

async function nativeDiscoverPages(baseUrl: string, maxPages: number): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);
    const res = await fetch(baseUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return [baseUrl];

    const html = await res.text();
    const linkRegex = /href=["']([^"'#]+)["']/gi;
    const urls = new Set<string>([normalizeDiscoveredUrl(baseUrl)]);
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const resolved = normalizeDiscoveredUrl(new URL(match[1], baseUrl).href);
        if (!shouldSkipDiscoveredUrl(resolved, baseUrl)) {
          urls.add(resolved);
        }
      } catch {
        /* skip invalid URLs */
      }
    }
    return prioritizeDiscoveredUrls(Array.from(urls), baseUrl).slice(0, maxPages);
  } catch (e) {
    console.warn("[Scrape] Native discovery failed:", e);
    return [normalizeDiscoveredUrl(baseUrl)];
  }
}

async function discoverPagesWithFirecrawl(baseUrl: string, maxPages: number): Promise<string[]> {
  if (!env.FIRECRAWL_API_KEY) return [];

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: baseUrl, limit: maxPages }),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const links: string[] = data.links || [];
    return prioritizeDiscoveredUrls(links, baseUrl).slice(0, maxPages);
  } catch (e) {
    console.warn("[Scrape] Firecrawl map failed:", e);
    return [];
  }
}

async function discoverPagesFromSitemaps(baseUrl: string, maxPages: number): Promise<string[]> {
  const sitemapQueue = await getCandidateSitemaps(baseUrl);
  if (sitemapQueue.length === 0) return [];

  const visited = new Set<string>();
  const discovered = new Set<string>();

  while (sitemapQueue.length > 0 && visited.size < MAX_SITEMAP_FETCHES && discovered.size < maxPages * 2) {
    const sitemapUrl = sitemapQueue.shift()!;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);

    const result = await fetchSitemapUrls(sitemapUrl);
    for (const nested of result.nestedSitemaps) {
      if (!visited.has(nested) && isWithinDiscoveryScope(nested, baseUrl)) {
        sitemapQueue.push(nested);
      }
    }

    for (const pageUrl of result.pageUrls) {
      if (!shouldSkipDiscoveredUrl(pageUrl, baseUrl)) {
        discovered.add(normalizeDiscoveredUrl(pageUrl));
      }
    }
  }

  return prioritizeDiscoveredUrls(Array.from(discovered), baseUrl).slice(0, maxPages);
}

async function getCandidateSitemaps(baseUrl: string): Promise<string[]> {
  const base = new URL(baseUrl);
  const candidates = new Set<string>(
    SITEMAP_CANDIDATE_PATHS.map((pathname) => new URL(pathname, base.origin).toString())
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);
    const res = await fetch(new URL("/robots.txt", base.origin), {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (res.ok) {
      const robots = await res.text();
      for (const match of Array.from(robots.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim))) {
        try {
          candidates.add(normalizeDiscoveredUrl(new URL(match[1], base.origin).toString()));
        } catch {
          /* ignore invalid sitemap URLs */
        }
      }
    }
  } catch (e) {
    console.warn("[Scrape] robots.txt sitemap discovery failed:", e);
  }

  return Array.from(candidates);
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<{ nestedSitemaps: string[]; pageUrls: string[] }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);
    const res = await fetch(sitemapUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "application/xml,text/xml,application/xhtml+xml,text/html;q=0.8,*/*;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { nestedSitemaps: [], pageUrls: [] };

    const xml = await res.text();
    const locs = Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi))
      .map((match) => decodeXmlEntities(match[1]).trim())
      .filter(Boolean);

    if (/<sitemapindex[\s>]/i.test(xml)) {
      return { nestedSitemaps: locs.map((loc) => normalizeDiscoveredUrl(loc)), pageUrls: [] };
    }

    return { nestedSitemaps: [], pageUrls: locs };
  } catch (e) {
    console.warn(`[Scrape] Sitemap fetch failed for ${sitemapUrl}:`, e);
    return { nestedSitemaps: [], pageUrls: [] };
  }
}

function prioritizeDiscoveredUrls(urls: string[], baseUrl: string) {
  return Array.from(
    new Set(
      urls
        .map((url) => {
          try {
            return normalizeDiscoveredUrl(url);
          } catch {
            return null;
          }
        })
        .filter((url): url is string => !!url)
        .filter((url) => !shouldSkipDiscoveredUrl(url, baseUrl))
    )
  ).sort((left, right) => scoreDiscoveredUrl(right, baseUrl) - scoreDiscoveredUrl(left, baseUrl));
}

function normalizeDiscoveredUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";

  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

function normalizeDiscoveryHost(hostname: string) {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function isWithinDiscoveryScope(candidate: string, baseUrl: string) {
  try {
    const candidateUrl = new URL(candidate);
    const base = new URL(baseUrl);
    const sameHost = normalizeDiscoveryHost(candidateUrl.hostname) === normalizeDiscoveryHost(base.hostname);
    if (!sameHost) return false;

    const basePath = normalizeScopedPath(base.pathname);
    const candidatePath = normalizeScopedPath(candidateUrl.pathname);
    if (basePath === "/") return true;
    return candidatePath === basePath || candidatePath.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
}

function normalizeScopedPath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

function shouldSkipDiscoveredUrl(url: string, baseUrl: string) {
  if (!isWithinDiscoveryScope(url, baseUrl)) return true;

  try {
    const parsed = new URL(url);
    const value = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|css|js|svg|ico|woff|woff2|pdf|zip|mp4|mp3|mov|webm|json|xml)(\/?$|$)/i.test(parsed.pathname)) {
      return true;
    }

    const lowValuePattern =
      /\/(wp-json|xmlrpc|feed|rss|search|tag|tags|category|categories|author|authors|comment|comments|cart|checkout|login|log-in|signin|sign-in|signup|sign-up|register|account|privacy|terms|policy|policies|cookie|cookies|share|amp)(\/|$)/i;
    return lowValuePattern.test(value);
  } catch {
    return true;
  }
}

function scoreDiscoveredUrl(url: string, baseUrl: string) {
  const parsed = new URL(url);
  const base = new URL(baseUrl);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const value = parsed.pathname.toLowerCase();

  let score = 0;

  if (normalizeDiscoveredUrl(url) === normalizeDiscoveredUrl(baseUrl)) score += 40;
  if (segments.length >= 2) score += 25;
  if (segments.length >= 3) score += 10;
  if (segments.length === 0) score -= 15;
  if (/\b(20\d{2}|19\d{2})\b/.test(value)) score += 20;
  if (/\/(blog|articles|posts|notes|docs|guides|essays|writing|news)\b/i.test(value)) score += 15;
  if (segments.some((segment) => segment.length > 20 || segment.includes("-"))) score += 10;
  if (parsed.pathname.endsWith("/")) score -= 4;
  if (normalizeScopedPath(base.pathname) !== "/" && value.startsWith(normalizeScopedPath(base.pathname).toLowerCase())) score += 12;

  return score;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ── HTML Utilities ───────────────────────────────────────────

function cleanHtml(html: string): string {
  let content = html;
  const mainMatch =
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(
      /<div[^>]*(?:role=["']main["']|id=["']content["']|class=["'][^"']*(?:content|main|article)[^"']*["'])[^>]*>([\s\S]*?)<\/div>/i
    );

  if (mainMatch) {
    const extracted = mainMatch[1] || mainMatch[2] || "";
    if (extracted.length > 200) content = extracted;
  }

  return (
    content
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<aside[\s\S]*?<\/aside>/gi, "")
      .replace(/<form[\s\S]*?<\/form>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/li>/gi, "")
      .replace(/<h([1-3])[^>]*>(.*?)<\/h\1>/gi, "\n\n## $2\n\n")
      .replace(/<h([4-6])[^>]*>(.*?)<\/h\1>/gi, "\n\n$2\n\n")
      .replace(
        /<\/?(p|div|br|blockquote|pre|article|section|main|ul|ol|table|tr|thead|tbody)[^>]*>/gi,
        "\n"
      )
      .replace(/<td[^>]*>/gi, " | ")
      .replace(/<th[^>]*>/gi, " | ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&mdash;/g, "\u2014")
      .replace(/&ndash;/g, "\u2013")
      .replace(/&hellip;/g, "\u2026")
      .replace(/&#\d+;/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function extractTitleFromHtml(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim().replace(/\s*[|\-–—].*$/, "");
  const ogMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogMatch) return ogMatch[1].trim();
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return null;
}

function extractTitleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const slug = path.split("/").filter(Boolean).pop() || "page";
    return slug.replace(/[-_]/g, " ").replace(/\.\w+$/, "");
  } catch {
    return url;
  }
}

function extractHeadingsFromHtml(html: string): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  const regex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text) headings.push({ level: parseInt(match[1]), text: text.slice(0, 200) });
  }
  return headings;
}

function extractHeadingsFromMarkdown(markdown: string): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    headings.push({ level: match[1].length, text: match[2].trim() });
  }
  return headings;
}

function extractPublishDate(html: string): string | null {
  const patterns = [
    /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /<time[^>]*datetime=["']([^"']+)["']/i,
    /<meta[^>]*name=["']date["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*name=["']publish[_-]?date["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function convertToMarkdown(
  content: string,
  headings: { level: number; text: string }[]
): string {
  // Content from native fetch is already partially markdown-ish
  // Just ensure proper heading formatting
  let md = content;
  for (const h of headings) {
    const prefix = "#".repeat(h.level);
    // Try to find and properly format headings in the text
    const escapedText = h.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    md = md.replace(new RegExp(`^\\s*${escapedText}\\s*$`, "m"), `${prefix} ${h.text}`);
  }
  return md;
}
