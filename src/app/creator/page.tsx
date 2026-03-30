"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, MessageCircle, User, BarChart3, ArrowRight, Plus, Loader2 } from "lucide-react";

export default function CreatorDashboard() {
  const [sources, setSources] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/knowledge/sources").then(r=>r.json()),
      fetch("/api/characters?mine=true").then(r=>r.json()),
    ]).then(([s,c])=>{ setSources(Array.isArray(s)?s:[]); setCharacters(Array.isArray(c)?c:[]); }).finally(()=>setLoading(false));
  }, []);

  if(loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;

  const indexed = sources.filter(s=>s.status==="INDEXED").length;
  const totalConvos = characters.reduce((s:number,c:any)=>s+(c._count?.conversations||0),0);

  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-semibold tracking-tight" style={{fontFamily:"var(--font-display)"}}>Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Manage your Echo characters and knowledge.</p></div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={BookOpen} label="Sources Indexed" value={indexed} href="/creator/knowledge"/>
        <Stat icon={MessageCircle} label="Conversations" value={totalConvos} href="/creator/analytics"/>
        <Stat icon={User} label="Characters" value={characters.length} href="/creator/character"/>
        <Stat icon={BarChart3} label="Published" value={characters.filter((c:any)=>c.status==="PUBLISHED").length} href="/creator/character"/>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Characters */}
        <div className="rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h3 className="text-sm font-semibold">Your Characters</h3>
            <Link href="/creator/character/new" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3"/>New</Link>
          </div>
          {characters.length===0?(
            <div className="px-5 py-10 text-center"><p className="text-sm text-muted-foreground">No characters yet.</p><Link href="/creator/character/new" className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline">Create one</Link></div>
          ):(
            <div className="divide-y divide-border">{characters.map((c:any)=>(
              <Link key={c.id} href={`/creator/character/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20">
                {c.avatarUrl?<img src={c.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-muted"/>:<div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{c.name?.[0]}</div>}
                <div className="flex-1 min-w-0"><p className="text-[13px] font-medium truncate">{c.name}</p><p className="text-[11px] text-muted-foreground">{c.status} · {c._count?.conversations||0} chats</p></div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40"/>
              </Link>
            ))}</div>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-xl border border-border bg-white">
          <div className="border-b border-border px-5 py-3.5"><h3 className="text-sm font-semibold">Quick Actions</h3></div>
          <div className="p-1.5">
            <QA icon={BookOpen} label="Import knowledge" href="/creator/knowledge"/>
            <QA icon={User} label="Create character" href="/creator/character/new"/>
            <QA icon={BarChart3} label="View analytics" href="/creator/analytics"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({icon:I,label,value,href}:{icon:any;label:string;value:number;href:string}) {
  return <Link href={href} className="rounded-xl border border-border bg-white p-5 hover:shadow-sm"><I className="mb-3 h-5 w-5 text-muted-foreground"/><p className="text-2xl font-semibold" style={{fontFamily:"var(--font-display)"}}>{value}</p><p className="mt-0.5 text-xs text-muted-foreground">{label}</p></Link>;
}
function QA({icon:I,label,href}:{icon:any;label:string;href:string}) {
  return <Link href={href} className="flex items-center gap-2.5 rounded-md px-3.5 py-2.5 text-[13px] hover:bg-muted/50"><I className="h-4 w-4 text-muted-foreground"/><span className="flex-1">{label}</span><ArrowRight className="h-3 w-3 text-muted-foreground/40"/></Link>;
}
