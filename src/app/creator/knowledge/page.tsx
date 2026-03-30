"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  FileText,
  FolderClosed,
  FolderOpen,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";

import { getKnowledgeDisplaySummary, getKnowledgeDisplayTitle, groupKnowledgeSources } from "@/lib/knowledge-display";
import { cn } from "@/lib/utils";

const statusCfg: Record<string, { label: string; color: string; icon: any }> = {
  INDEXED: { label: "Indexed", color: "bg-emerald-50 text-emerald-700", icon: Check },
  PROCESSING: { label: "Processing", color: "bg-amber-50 text-amber-700", icon: Clock },
  CRAWLING: { label: "Crawling", color: "bg-blue-50 text-blue-700", icon: Clock },
  PENDING: { label: "Pending", color: "bg-gray-50 text-gray-600", icon: Clock },
  ERROR: { label: "Error", color: "bg-red-50 text-red-700", icon: AlertCircle },
};

const typeCfg: Record<string, { label: string; color: string; icon: any }> = {
  URL: { label: "URL", color: "bg-blue-50 text-blue-700", icon: Globe },
  UPLOAD: { label: "Upload", color: "bg-violet-50 text-violet-700", icon: FileText },
  TEXT: { label: "Text", color: "bg-amber-50 text-amber-700", icon: Type },
  WEBSITE: { label: "Website", color: "bg-purple-50 text-purple-700", icon: Globe },
};

async function readResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return {
    error:
      text
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200) || `Request failed with status ${response.status}`,
  };
}

export default function KnowledgePage() {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<null | "url" | "text" | "website" | "upload">(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; status: string }[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => fetch("/api/knowledge/sources").then((r) => r.json()).then((d) => setSources(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const ingest = async (body: any) => {
    setIngesting(true);
    try {
      const response = await fetch("/api/knowledge/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await readResponse(response);
      if (!response.ok) {
        alert(`Ingestion failed: ${data.error || "Unknown error"}${data.blocked ? "\n\nThis site may be blocking automated access." : ""}`);
      }
      await load();
    } catch (error: any) {
      alert(`Network error: ${error.message}`);
    } finally {
      setIngesting(false);
      setAddMode(null);
      setUrl("");
      setTitle("");
      setText("");
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const allowed = ["pdf", "docx", "pptx", "txt", "md"];
    const valid = Array.from(files).filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return ext && allowed.includes(ext) && file.size <= 10 * 1024 * 1024;
    });
    if (!valid.length) {
      alert("No valid files. Supported: PDF, DOCX, PPTX, TXT, MD (max 10MB each).");
      return;
    }

    setUploadProgress(valid.map((file) => ({ name: file.name, status: "uploading" })));
    setIngesting(true);
    const formData = new FormData();
    valid.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/knowledge/upload", { method: "POST", body: formData });
      const data = await readResponse(response);
      if (data.results) {
        setUploadProgress(data.results.map((result: any) => ({ name: result.filename, status: result.error ? `Error: ${result.error}` : "Done" })));
      }
      if (!response.ok && data.error) {
        alert(`Upload failed: ${data.error}`);
      }
      await load();
      setTimeout(() => {
        setUploadProgress([]);
        setAddMode(null);
      }, 2000);
    } catch (error: any) {
      alert(`Upload failed: ${error.message}`);
      setUploadProgress([]);
    } finally {
      setIngesting(false);
    }
  };

  const deleteSources = async (sourceIds: string[]) => {
    const label = sourceIds.length === 1 ? "this source" : `${sourceIds.length} grouped sources`;
    if (!window.confirm(`Delete ${label}?`)) return false;

    const response = await fetch("/api/knowledge/sources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceIds }),
    });
    const data = await readResponse(response);
    if (!response.ok) {
      alert(data.error || "Failed to delete source");
      return false;
    }

    setSources((current) => current.filter((source) => !sourceIds.includes(source.id)));
    return true;
  };

  const resync = async () => {
    setSyncing(true);
    await fetch("/api/knowledge/resync", { method: "POST" });
    await load();
    setSyncing(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) uploadFiles(event.dataTransfer.files);
  };

  const groupedItems = groupKnowledgeSources(sources);
  const filtered = groupedItems.filter((item) => !search || item.searchText.includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Knowledge Base</h1>
        <p className="mt-1 text-sm text-muted-foreground">{sources.filter((source) => source.status === "INDEXED").length} indexed · {sources.reduce((total: number, source: any) => total + (source.chunkCount || 0), 0)} chunks</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAddMode("upload")} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30"><Upload className="h-3.5 w-3.5" />Upload Files</button>
          <button onClick={() => setAddMode("url")} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30"><Globe className="h-3.5 w-3.5" />Add URL</button>
          <button onClick={() => setAddMode("website")} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30"><Globe className="h-3.5 w-3.5" />Crawl Site</button>
          <button onClick={() => setAddMode("text")} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30"><Type className="h-3.5 w-3.5" />Add Text</button>
          <button onClick={resync} disabled={syncing} className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-white hover:opacity-80 disabled:opacity-50"><RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />{syncing ? "Syncing…" : "Resync"}</button>
        </div>
      </div>

      {addMode === "upload" && (
        <div className={cn("rounded-xl border-2 border-dashed bg-white p-8 text-center transition-colors", dragOver ? "border-foreground bg-muted/20" : "border-border")}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}>
          {uploadProgress.length > 0 ? (
            <div className="mx-auto max-w-md space-y-2 text-left">
              {uploadProgress.map((progress, index) => (
                <div key={index} className="flex items-center gap-2 text-[13px]">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{progress.name}</span>
                  <span className={cn("text-[11px] flex-shrink-0", progress.status === "Done" ? "text-emerald-600" : progress.status === "uploading" ? "text-amber-600" : "text-red-600")}>
                    {progress.status === "uploading" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : progress.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-[13px] font-medium">Drag & drop files here</p>
              <p className="mt-1 text-[11px] text-muted-foreground">PDF, DOCX, PPTX, TXT, MD — max 10MB each</p>
              <button onClick={() => fileInputRef.current?.click()} className="mt-3 rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-white hover:opacity-80">Browse files</button>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md" className="hidden" onChange={(event) => event.target.files && uploadFiles(event.target.files)} />
            </>
          )}
          <button onClick={() => { setAddMode(null); setUploadProgress([]); }} className="mx-auto mt-3 block text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}

      {addMode === "url" && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-4">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://blog.example.com/article" className="flex-1 text-sm outline-none" onKeyDown={(event) => event.key === "Enter" && ingest({ type: "url", url })} />
          <button disabled={ingesting || !url.trim()} onClick={() => ingest({ type: "url", url })} className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-white disabled:opacity-50">{ingesting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ingest"}</button>
          <button onClick={() => setAddMode(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      )}

      {addMode === "website" && (
        <div className="space-y-2 rounded-xl border border-border bg-white p-4">
          <p className="text-[13px] text-muted-foreground">Enter your site URL. Echo will crawl the pages, then group pages from the same main domain together in your library.</p>
          <div className="flex items-center gap-2">
            <input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-blog.com" className="h-9 flex-1 rounded-md border border-border px-3 text-sm outline-none focus:border-foreground" />
            <button disabled={ingesting || !url.trim()} onClick={() => ingest({ type: "website", url })} className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{ingesting ? "Crawling…" : "Crawl All Pages"}</button>
            <button onClick={() => setAddMode(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        </div>
      )}

      {addMode === "text" && (
        <div className="space-y-3 rounded-xl border border-border bg-white p-4">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-foreground" />
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste content…" rows={4} className="w-full rounded-md border border-border p-3 text-sm outline-none resize-none focus:border-foreground" />
          <div className="flex gap-2">
            <button disabled={ingesting || !title.trim() || !text.trim()} onClick={() => ingest({ type: "text", title, text })} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{ingesting ? "Processing…" : "Add"}</button>
            <button onClick={() => setAddMode(null)} className="text-xs text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, URL, summary, or topic…" className="h-9 w-full rounded-md border border-border pl-10 pr-4 text-sm outline-none focus:border-foreground" /></div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-14 text-center text-sm text-muted-foreground">No sources yet. Upload files, add a URL, or paste text above.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const primaryMember = item.members[0];
            const status = statusCfg[item.status] || statusCfg.PENDING;
            const type = typeCfg[primaryMember?.type] || typeCfg.TEXT;
            const isFolder = item.kind === "domain";
            const TypeIcon = isFolder ? FolderClosed : type.icon;

            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={cn(
                  "group cursor-pointer overflow-hidden rounded-[24px] border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
                  isFolder
                    ? "border-amber-200/80 shadow-amber-100/40 hover:border-amber-300"
                    : "border-border hover:border-border/80"
                )}
              >
                <div className={cn("px-5 pb-5 pt-5", isFolder && "bg-[linear-gradient(180deg,rgba(251,191,36,0.16),rgba(255,255,255,0))]")}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={cn(
                      "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl",
                      isFolder ? "bg-amber-100 text-amber-700" : "bg-muted"
                    )}>
                      <TypeIcon className={cn("h-4 w-4", isFolder ? "text-amber-700" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 break-words text-[14px] font-semibold leading-snug">{item.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium", isFolder ? "bg-amber-100 text-amber-800" : type.color)}>
                          {isFolder ? "Folder" : type.label}
                        </span>
                        {item.pageCount > 1 && <span className="inline-flex rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700">{item.pageCount} pages</span>}
                        {item.topic && <span className="inline-flex rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] text-muted-foreground">{item.topic}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={async (event) => { event.stopPropagation(); const deleted = await deleteSources(item.sourceIds); if (deleted) setSelectedItem(null); }} className="ml-2 flex-shrink-0 text-muted-foreground/40 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>

                {item.sourceUrl && (
                  <p className="mb-2 truncate text-[11px] text-muted-foreground">{item.sourceUrl}</p>
                )}

                <p className={cn("mb-4 text-[12px] leading-relaxed", isFolder ? "line-clamp-5 text-neutral-700" : "line-clamp-4 text-muted-foreground")}>
                  {item.summary}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium", status.color)}><status.icon className="h-2.5 w-2.5" />{status.label}</span>
                    <span className="text-[11px] text-muted-foreground">{item.chunkCount} chunks</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" />
                </div>

                {item.status === "ERROR" && item.members.some((member) => member.errorMsg) && (
                  <p className="mt-2 truncate text-[11px] text-red-600" title={item.members.find((member) => member.errorMsg)?.errorMsg}>
                    {item.members.find((member) => member.errorMsg)?.errorMsg}
                  </p>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedItem && (() => {
        const primaryMember = selectedItem.members[0];
        const status = statusCfg[selectedItem.status] || statusCfg.PENDING;
        const type = typeCfg[primaryMember?.type] || typeCfg.TEXT;
        const isFolder = selectedItem.kind === "domain";
        const TypeIcon = isFolder ? FolderOpen : type.icon;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-end" onClick={() => setSelectedItem(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-6 py-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                    <TypeIcon className={cn("h-5 w-5", isFolder ? "text-amber-700" : "text-muted-foreground")} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 break-words text-[15px] font-semibold">{selectedItem.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium", isFolder ? "bg-amber-100 text-amber-800" : type.color)}>
                        {isFolder ? "Folder" : type.label}
                      </span>
                      {selectedItem.pageCount > 1 && <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700">{selectedItem.pageCount} pages</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedItem(null)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>

              <div className="space-y-5 px-6 py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium", status.color)}><status.icon className="h-3.5 w-3.5" />{status.label}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[12px] text-muted-foreground"><Database className="h-3.5 w-3.5" />{selectedItem.chunkCount} chunks</span>
                  {selectedItem.createdAt && <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[12px] text-muted-foreground"><Calendar className="h-3.5 w-3.5" />{new Date(selectedItem.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                </div>

                {selectedItem.sourceUrl && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Source</p>
                    <a href={selectedItem.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 break-all text-[13px] text-blue-600 hover:underline">
                      {selectedItem.sourceUrl}<ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                )}

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Summary</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{selectedItem.summary}</p>
                </div>

                {selectedItem.kind === "domain" ? (
                  <div>
                    <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Pages In This Domain Group</p>
                    <div className="space-y-3">
                      {selectedItem.members.map((member: any) => (
                        <div key={member.id} className="rounded-xl border border-border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold">{getKnowledgeDisplayTitle(member)}</p>
                              {member.sourceUrl && (
                                <a href={member.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                                  {member.sourceUrl}<ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] text-muted-foreground">{member.chunkCount || 0} chunks</span>
                          </div>
                          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{getKnowledgeDisplaySummary(member)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : primaryMember?.fileName ? (
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Filename</p>
                    <p className="text-[13px] text-foreground">{primaryMember.fileName}</p>
                  </div>
                ) : null}

                {selectedItem.status === "ERROR" && primaryMember?.errorMsg && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="mb-1 text-[11px] font-medium text-red-800">Error</p>
                    <p className="text-[12px] text-red-700">{primaryMember.errorMsg}</p>
                  </div>
                )}

                <div className="flex gap-2 border-t border-border pt-2">
                  <button
                    onClick={async () => {
                      const deleted = await deleteSources(selectedItem.sourceIds);
                      if (deleted) setSelectedItem(null);
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-3 text-[12px] font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />Delete {selectedItem.kind === "domain" ? "group" : "source"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
