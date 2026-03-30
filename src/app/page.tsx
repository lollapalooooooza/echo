"use client";
import Link from "next/link";
import { ArrowRight, Play, BookOpen, Mic, Video, Users } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <BrandMark href="/" size="sm" />
          <div className="flex items-center gap-6">
            <Link href="/lobby" className="text-sm text-muted-foreground hover:text-foreground">Explore</Link>
            <Link href="/auth" className="inline-flex h-8 items-center rounded-md bg-foreground px-3.5 text-[13px] font-medium text-white hover:opacity-80">Get started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pb-24 pt-16 sm:pt-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="text-center lg:text-left">
          <p className="mb-5 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">A new way to share knowledge</p>
          <h1 className="mb-5 text-[2.75rem] leading-[1.1] font-semibold tracking-tight sm:text-[3.5rem]" style={{fontFamily:"var(--font-display)"}}>
            Turn your knowledge into<br/>a living EchoNest character.
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            EchoNest transforms your articles into an AI character that speaks with your voice and answers questions in live video conversations.
          </p>
          <div className="flex items-center justify-center gap-3 lg:justify-start">
            <Link href="/auth" className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-5 text-sm font-medium text-white hover:opacity-80">Create your character <ArrowRight className="h-3.5 w-3.5" /></Link>
            <Link href="/lobby" className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-5 text-sm font-medium hover:bg-muted/40"><Play className="h-3.5 w-3.5" /> Explore</Link>
          </div>
        </div>
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-[34px] border border-amber-200/60 bg-[linear-gradient(160deg,#fff6d8_0%,#fffdf4_52%,#ffffff_100%)] p-6 shadow-[0_28px_100px_-60px_rgba(245,158,11,0.55)]">
              <img
                src="/brand/echonest-mascot.png"
                alt="EchoNest mascot"
                className="mx-auto aspect-square w-full max-w-[24rem] object-contain"
              />
              <div className="mt-5 rounded-[24px] bg-white/80 px-5 py-4 text-center shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-amber-700/75">EchoNest mascot</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Your new brand companion for living knowledge characters, voice libraries, and live sessions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-14 text-3xl font-semibold tracking-tight" style={{fontFamily:"var(--font-display)"}}>From articles to live conversation.</h2>
          <div className="grid gap-10 sm:grid-cols-2">
            {[
              { icon: BookOpen, title: "Import knowledge", desc: "Submit your website URL or paste content. EchoNest crawls with Firecrawl, chunks, and embeds with OpenAI." },
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

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} EchoNest</footer>
    </div>
  );
}
