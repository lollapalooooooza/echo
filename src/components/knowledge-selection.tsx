"use client";

import { BookOpen, Check, FileText, FolderClosed, Globe, Loader2, Type } from "lucide-react";

import { type KnowledgeDisplayItem, groupKnowledgeSources } from "@/lib/knowledge-display";
import { cn } from "@/lib/utils";

const sourceTypeIcon: Record<string, any> = {
  URL: Globe,
  UPLOAD: FileText,
  TEXT: Type,
  WEBSITE: Globe,
};

const sourceTypeBadge: Record<string, { label: string; color: string }> = {
  URL: { label: "URL", color: "bg-blue-50 text-blue-700" },
  UPLOAD: { label: "File", color: "bg-amber-50 text-amber-700" },
  TEXT: { label: "Text", color: "bg-emerald-50 text-emerald-700" },
  WEBSITE: { label: "Website", color: "bg-purple-50 text-purple-700" },
};

type SourceRecord = {
  id: string;
  title: string;
  type: string;
  sourceUrl?: string | null;
  fileName?: string | null;
  status: string;
  chunkCount?: number;
  summary?: string | null;
  topic?: string | null;
  createdAt?: string;
};

export function KnowledgeSelection({
  sources,
  loading,
  selectedSourceIds,
  onToggleItem,
  onToggleAll,
  emptyHref = "/creator/knowledge",
}: {
  sources: SourceRecord[];
  loading: boolean;
  selectedSourceIds: string[];
  onToggleItem: (item: KnowledgeDisplayItem<SourceRecord>) => void;
  onToggleAll: () => void;
  emptyHref?: string;
}) {
  const indexedSources = sources.filter((source) => source.status === "INDEXED");
  const items = groupKnowledgeSources(indexedSources);
  const allSelected = indexedSources.length > 0 && indexedSources.every((source) => selectedSourceIds.includes(source.id));
  const selectedItemCount = items.filter((item) => item.sourceIds.every((id) => selectedSourceIds.includes(id))).length;

  if (loading) {
    return <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-10 text-center">
        <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
        <p className="text-[13px] text-muted-foreground">No indexed knowledge sources yet.</p>
        <a href={emptyHref} className="text-[13px] font-medium text-foreground underline underline-offset-4 decoration-neutral-300 hover:decoration-neutral-500">
          Add content first
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={onToggleAll}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
          allSelected ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/30"
        )}
      >
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-md border transition-colors", allSelected ? "border-foreground bg-foreground text-white" : "border-border")}>
          {allSelected && <Check className="h-3.5 w-3.5" />}
        </div>
        <div>
          <p className="text-[13px] font-semibold">{allSelected ? "Deselect all" : "Select all"} ({items.length} libraries)</p>
          <p className="text-[11px] text-muted-foreground">Website crawls are grouped by main domain to make selection easier.</p>
        </div>
      </button>

      <div className="max-h-[34rem] overflow-y-auto rounded-2xl border border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const primaryMember = item.members[0];
            const isFolder = item.kind === "domain";
            const Icon = isFolder ? FolderClosed : sourceTypeIcon[primaryMember?.type] || FileText;
            const badge = sourceTypeBadge[primaryMember?.type] || sourceTypeBadge.TEXT;
            const isSelected = item.sourceIds.every((id) => selectedSourceIds.includes(id));

            return (
              <button
                key={item.id}
                onClick={() => onToggleItem(item)}
                className={cn(
                  "flex min-h-[148px] flex-col rounded-2xl border p-4 text-left transition-all",
                  isSelected ? "border-foreground bg-foreground/5 shadow-sm" : "border-border hover:border-foreground/30 hover:bg-muted/20"
                )}
              >
                <div className="mb-3 flex items-start gap-3">
                  <div className={cn("mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition-colors", isSelected ? "border-foreground bg-foreground text-white" : "border-border bg-white")}>
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl", isFolder ? "bg-amber-100" : "bg-muted")}>
                      <Icon className={cn("h-4 w-4", isFolder ? "text-amber-700" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 break-words text-sm font-semibold leading-snug">{item.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium", isFolder ? "bg-amber-100 text-amber-800" : badge.color)}>
                          {isFolder ? "Folder" : badge.label}
                        </span>
                        {item.pageCount > 1 && <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700">{item.pageCount} pages</span>}
                        {item.topic && <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] text-muted-foreground">{item.topic}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">{item.summary}</p>

                <div className="mt-auto flex items-center justify-between pt-4 text-[11px] text-muted-foreground">
                  <span>{item.chunkCount} chunks</span>
                  <span>{item.sourceIds.length} source{item.sourceIds.length === 1 ? "" : "s"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {selectedSourceIds.length > 0
          ? `${selectedItemCount} library${selectedItemCount === 1 ? "" : "ies"} selected across ${selectedSourceIds.length} source${selectedSourceIds.length === 1 ? "" : "s"}`
          : "No sources selected — character will use all your knowledge"}
      </p>
    </div>
  );
}
