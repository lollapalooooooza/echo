"use client";
import { useEffect, useState } from "react";
import { MessageCircle, TrendingUp, HelpCircle, Loader2, ArrowUp } from "lucide-react";
import { formatNumber } from "@/lib/utils";

export default function AnalyticsPage() {
  const [chars, setChars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/characters?mine=true").then(r => r.json()).then(d => { setChars(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  if (loading) return <div className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const totalConvos = chars.reduce((s: number, c: any) => s + (c._count?.conversations || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conversation data across all your characters.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-white p-5">
          <MessageCircle className="mb-3 h-5 w-5 text-muted-foreground" />
          <p className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>{formatNumber(totalConvos)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Total Conversations</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <TrendingUp className="mb-3 h-5 w-5 text-muted-foreground" />
          <p className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>{chars.length}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Active Characters</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <HelpCircle className="mb-3 h-5 w-5 text-muted-foreground" />
          <p className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>{chars.filter((c: any) => c.status === "PUBLISHED").length}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Published</p>
        </div>
      </div>

      {/* Per-character breakdown */}
      <div className="rounded-xl border border-border bg-white">
        <div className="border-b border-border px-5 py-3.5"><h3 className="text-sm font-semibold">By Character</h3></div>
        {chars.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No characters yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {chars.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-muted" /> : <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{c.name?.[0]}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{c._count?.conversations || 0}</p>
                  <p className="text-[11px] text-muted-foreground">conversations</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
