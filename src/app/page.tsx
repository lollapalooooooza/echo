"use client";
import Link from "next/link";
import { ArrowRight, Play, BookOpen, Mic, Video, Users } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground"><span className="text-xs font-bold text-white">E</span></div><span className="text-[15px] font-semibold tracking-tight">Echo</span></Link>
          <div className="flex items-center gap-6">
            <Link href="/lobby" className="text-sm text-muted-foreground hover:text-foreground">Explore</Link>
            <Link href="/auth" className="inline-flex h-8 items-center rounded-md bg-foreground px-3.5 text-[13px] font-medium text-white hover:opacity-80">Get started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pb-24 pt-20 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-5 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">A new way to share knowledge</p>
          <h1 className="mb-5 text-[2.75rem] leading-[1.1] font-semibold tracking-tight sm:text-[3.5rem]" style={{fontFamily:"var(--font-display)"}}>
            Turn your knowledge into<br/>a living character.
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            Echo transforms your articles into an AI character that speaks with your voice and answers questions in live video conversations.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/auth" className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-5 text-sm font-medium text-white hover:opacity-80">Create your character <ArrowRight className="h-3.5 w-3.5" /></Link>
            <Link href="/lobby" className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-5 text-sm font-medium hover:bg-muted/40"><Play className="h-3.5 w-3.5" /> Explore</Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-14 text-3xl font-semibold tracking-tight" style={{fontFamily:"var(--font-display)"}}>From articles to live conversation.</h2>
          <div className="grid gap-10 sm:grid-cols-2">
            {[
              { icon: BookOpen, title: "Import knowledge", desc: "Submit your website URL or paste content. Echo crawls with Firecrawl, chunks, and embeds with OpenAI." },
              { icon: Mic, title: "Choose a voice", desc: "Pick an ElevenLabs preset or clone your own voice from a 30-second sample." },
              { icon: Video, title: "Generate video character", desc: "Runway creates a video character from your avatar that lip-syncs when speaking." },
              { icon: Users, title: "Go live", desc: "Publish to the lobby. Embed on your site with one script tag. Visitors talk to you in real-time." },
            ].map((s) => (
              <div key={s.title} className="group">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60"><s.icon className="h-4 w-4" /></div>
                <h3 className="mb-1.5 text-[15px] font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border px-6 py-24 text-center">
        <h2 className="mb-4 text-3xl font-semibold tracking-tight" style={{fontFamily:"var(--font-display)"}}>Your visitors have questions.<br/>Your writing has answers.</h2>
        <Link href="/auth" className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-5 text-sm font-medium text-white hover:opacity-80">Create your character <ArrowRight className="h-3.5 w-3.5" /></Link>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Echo</footer>
    </div>
  );
}
