"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LayoutDashboard, BookOpen, User, BarChart3, Menu, X, Play, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label:"Dashboard", href:"/creator", icon: LayoutDashboard },
  { label:"Knowledge", href:"/creator/knowledge", icon: BookOpen },
  { label:"Characters", href:"/creator/character", icon: User },
  { label:"Analytics", href:"/creator/analytics", icon: BarChart3 },
  { label:"Settings", href:"/creator/settings", icon: Settings },
];

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  const [open,setOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {open && <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={()=>setOpen(false)}/>}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-border bg-white transition-transform duration-200 lg:static lg:translate-x-0",open?"translate-x-0":"-translate-x-full")}>
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link href="/" className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground"><span className="text-xs font-bold text-white">E</span></div><span className="text-[15px] font-semibold tracking-tight">Echo</span></Link>
          <button onClick={()=>setOpen(false)} className="lg:hidden"><X className="h-5 w-5 text-muted-foreground"/></button>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {nav.map(n=>{
            const active=pathname===n.href||(n.href!=="/creator"&&pathname.startsWith(n.href));
            return <Link key={n.href} href={n.href} onClick={()=>setOpen(false)} className={cn("flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium",active?"bg-muted text-foreground":"text-muted-foreground hover:bg-muted/50 hover:text-foreground")}><n.icon className="h-4 w-4"/>{n.label}</Link>;
          })}
        </nav>
        <div className="border-t border-border p-2 space-y-0.5">
          <Link href="/lobby" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted/50"><Play className="h-4 w-4"/>Lobby</Link>
          {session && <button onClick={()=>signOut()} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted/50"><LogOut className="h-4 w-4"/>Sign out</button>}
        </div>
        {session?.user && (
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2.5">
              {session.user.image?<img src={session.user.image} alt="" className="h-7 w-7 rounded-full"/>:<div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">{session.user.name?.[0]}</div>}
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{session.user.name}</p><p className="truncate text-[11px] text-muted-foreground">{session.user.email}</p></div>
            </div>
          </div>
        )}
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-border bg-white px-4 lg:px-6">
          <button onClick={()=>setOpen(true)} className="lg:hidden"><Menu className="h-5 w-5"/></button>
        </header>
        <main className="flex-1 overflow-y-auto"><div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">{children}</div></main>
      </div>
    </div>
  );
}
