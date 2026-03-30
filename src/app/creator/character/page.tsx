"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, ArrowRight } from "lucide-react";

export default function CharacterListPage() {
  const [chars,setChars]=useState<any[]>([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{fetch("/api/characters?mine=true").then(r=>r.json()).then(d=>{setChars(Array.isArray(d)?d:[]);setLoading(false);});},[]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight" style={{fontFamily:"var(--font-display)"}}>Characters</h1><p className="mt-1 text-sm text-muted-foreground">Create and manage your Echo characters.</p></div>
        <Link href="/creator/character/new" className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-white hover:opacity-80"><Plus className="h-3.5 w-3.5"/>New Character</Link>
      </div>

      {loading?<div className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground"/></div>:
      chars.length===0?<div className="py-20 text-center rounded-xl border border-dashed border-border"><p className="text-sm text-muted-foreground mb-2">No characters yet.</p><Link href="/creator/character/new" className="text-sm font-medium underline">Create your first character</Link></div>:
      <div className="grid gap-4 sm:grid-cols-2">
        {chars.map((c:any)=>(
          <Link key={c.id} href={`/creator/character/${c.id}`} className="group rounded-xl border border-border bg-white p-5 hover:shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              {c.avatarUrl?<img src={c.avatarUrl} alt="" className="h-10 w-10 rounded-full bg-muted"/>:<div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-bold">{c.name?.[0]}</div>}
              <div><p className="text-[15px] font-semibold">{c.name}</p><p className="text-[11px] text-muted-foreground">{c.status} · {c._count?.conversations||0} conversations</p></div>
            </div>
            <p className="text-[13px] text-muted-foreground line-clamp-2">{c.bio}</p>
            <div className="mt-3 flex items-center gap-2">
              {c.voice&&<span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">🔊 Voice</span>}
              {c.speakingVideoUrl&&<span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">🎬 Video</span>}
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground"/>
            </div>
          </Link>
        ))}
      </div>}
    </div>
  );
}
