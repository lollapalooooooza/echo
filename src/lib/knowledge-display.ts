type KnowledgeLike = {
  id: string;
  title: string;
  type: string;
  sourceUrl?: string | null;
  fileName?: string | null;
  summary?: string | null;
  topic?: string | null;
  status: string;
  chunkCount?: number | null;
  createdAt?: string | Date | null;
};

export type KnowledgeDisplayItem<T extends KnowledgeLike = KnowledgeLike> = {
  id: string;
  kind: "single" | "domain";
  title: string;
  summary: string;
  sourceUrl?: string | null;
  fileName?: string | null;
  topic?: string | null;
  status: string;
  chunkCount: number;
  pageCount: number;
  sourceIds: string[];
  members: T[];
  searchText: string;
  domainLabel?: string | null;
  createdAt?: string | Date | null;
  webSourceCount?: number;
};

const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.jp",
  "com.br",
  "com.mx",
]);

const HOSTED_SUBDOMAIN_SUFFIXES = new Set([
  "blogspot.com",
  "substack.com",
  "github.io",
  "wordpress.com",
  "tumblr.com",
  "ghost.io",
  "notion.site",
]);

const STATUS_PRIORITY: Record<string, number> = {
  ERROR: 5,
  CRAWLING: 4,
  PROCESSING: 3,
  PENDING: 2,
  INDEXED: 1,
};

function cleanText(value?: string | null, maxLength = 180) {
  const cleaned = (value || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripWww(hostname: string) {
  return hostname.replace(/^www\./i, "");
}

export function getDomainLabel(url?: string | null) {
  if (!url) return null;

  try {
    const hostname = stripWww(new URL(url).hostname.toLowerCase());
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;

    const hostedSuffix = parts.slice(-2).join(".");
    if (HOSTED_SUBDOMAIN_SUFFIXES.has(hostedSuffix)) {
      return hostname;
    }

    const suffix = parts.slice(-2).join(".");
    if (MULTI_PART_TLDS.has(suffix) && parts.length >= 3) {
      return parts.slice(-3).join(".");
    }

    return parts.slice(-2).join(".");
  } catch {
    return null;
  }
}

function getPathLabel(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/") return "/";
    return decodeURIComponent(pathname).replace(/\/+/g, "/");
  } catch {
    return null;
  }
}

function fileTitle(source: KnowledgeLike) {
  if (source.fileName) {
    return source.fileName.replace(/\.[^.]+$/, "");
  }
  return cleanText(source.title, 80) || "Untitled source";
}

export function getKnowledgeDisplayTitle(source: KnowledgeLike) {
  const domainLabel = getDomainLabel(source.sourceUrl);
  const pathLabel = getPathLabel(source.sourceUrl);
  const baseTitle = cleanText(source.title, 90);

  if (source.type === "UPLOAD") {
    return fileTitle(source);
  }

  if (source.type === "TEXT") {
    return baseTitle || "Text note";
  }

  if ((source.type === "URL" || source.type === "WEBSITE") && domainLabel) {
    if (baseTitle && !/^https?:\/\//i.test(baseTitle)) {
      return baseTitle;
    }

    if (pathLabel && pathLabel !== "/") {
      const shortPath = pathLabel.length > 48 ? `/${pathLabel.split("/").filter(Boolean).slice(-2).join("/")}` : pathLabel;
      return `${domainLabel}${shortPath}`;
    }

    return `${domainLabel}/`;
  }

  return baseTitle || "Untitled source";
}

export function getKnowledgeDisplaySummary(source: KnowledgeLike) {
  const summary = cleanText(source.summary, 180);
  const pathLabel = getPathLabel(source.sourceUrl);
  const details = [source.topic ? `Topic: ${source.topic}` : null, pathLabel && pathLabel !== "/" ? `Path: ${pathLabel}` : null].filter(Boolean);

  if (details.length && summary) {
    return `${details.join(" • ")}. ${summary}`;
  }

  if (details.length) {
    return details.join(" • ");
  }

  if (summary) {
    return summary;
  }

  if (source.fileName) {
    return `Uploaded file: ${source.fileName}`;
  }

  return source.type === "WEBSITE"
    ? "Website crawl with grouped page content."
    : source.type === "URL"
      ? "Single web page source."
      : "Knowledge source ready for character answers.";
}

function aggregateStatus(statuses: string[]) {
  return [...statuses].sort((a, b) => (STATUS_PRIORITY[b] || 0) - (STATUS_PRIORITY[a] || 0))[0] || "PENDING";
}

function buildDomainSummary<T extends KnowledgeLike>(domainLabel: string, members: T[]) {
  const memberTitles = members
    .map((member) => {
      const pathLabel = getPathLabel(member.sourceUrl);
      if (pathLabel && pathLabel !== "/") {
        return pathLabel;
      }
      return cleanText(member.title, 50);
    })
    .filter(Boolean);
  const summaryHighlights = Array.from(new Set(members.map((member) => cleanText(member.summary, 90)).filter(Boolean))).slice(0, 2);

  const uniqueLabels = Array.from(new Set(memberTitles)).slice(0, 4);
  const topics = Array.from(new Set(members.map((member) => member.topic).filter(Boolean))).slice(0, 2);
  const coverage = uniqueLabels.length
    ? `Covers ${members.length} pages from ${domainLabel}/ including ${uniqueLabels.join(", ")}`
    : `Covers ${members.length} pages from ${domainLabel}/`;

  if (summaryHighlights.length > 0) {
    return `${coverage}. ${summaryHighlights.join(" ")}`;
  }

  if (topics.length > 0) {
    return `${coverage}. Topics: ${topics.join(", ")}.`;
  }

  return `${coverage}.`;
}

function buildSingleItem<T extends KnowledgeLike>(source: T): KnowledgeDisplayItem<T> {
  return {
    id: source.id,
    kind: "single",
    title: getKnowledgeDisplayTitle(source),
    summary: getKnowledgeDisplaySummary(source),
    sourceUrl: source.sourceUrl,
    fileName: source.fileName,
    topic: source.topic || null,
    status: source.status,
    chunkCount: source.chunkCount || 0,
    pageCount: 1,
    sourceIds: [source.id],
    members: [source],
    createdAt: source.createdAt,
    searchText: [
      source.title,
      source.fileName,
      source.sourceUrl,
      source.summary,
      source.topic,
      getKnowledgeDisplayTitle(source),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export function groupKnowledgeSources<T extends KnowledgeLike>(sources: T[]) {
  const groupedWebsiteSources = new Map<string, T[]>();
  const items: KnowledgeDisplayItem<T>[] = [];

  for (const source of sources) {
    const domainLabel = source.sourceUrl && (source.type === "WEBSITE" || source.type === "URL")
      ? getDomainLabel(source.sourceUrl)
      : null;

    if (domainLabel) {
      const existing = groupedWebsiteSources.get(domainLabel) || [];
      existing.push(source);
      groupedWebsiteSources.set(domainLabel, existing);
      continue;
    }

    items.push(buildSingleItem(source));
  }

  for (const [domainLabel, members] of Array.from(groupedWebsiteSources.entries())) {
    if (members.length === 1) {
      items.push(buildSingleItem(members[0]));
      continue;
    }

    const status = aggregateStatus(members.map((member) => member.status));
    const chunkCount = members.reduce((total, member) => total + (member.chunkCount || 0), 0);
    const sourceIds = members.map((member) => member.id);
    const primaryTopic = Array.from(new Set(members.map((member) => member.topic).filter(Boolean)))[0] || null;

    items.push({
      id: `domain:${domainLabel}`,
      kind: "domain",
      title: `${domainLabel}/`,
      summary: buildDomainSummary(domainLabel, members),
      sourceUrl: `https://${domainLabel}/`,
      topic: primaryTopic,
      status,
      chunkCount,
      pageCount: members.length,
      sourceIds,
      members,
      createdAt: members[0]?.createdAt,
      domainLabel,
      webSourceCount: members.filter((member) => member.type === "WEBSITE" || member.type === "URL").length,
      searchText: [
        domainLabel,
        ...members.map((member) => [member.title, member.sourceUrl, member.summary, member.topic].filter(Boolean).join(" ")),
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  return items.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}
