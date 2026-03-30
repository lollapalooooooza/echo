"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, MessageCircle, Plus, Trash2, Video, Volume2 } from "lucide-react";

import { cn } from "@/lib/utils";

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

function CharacterArt({ character }: { character: any }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (character.avatarUrl && !imageFailed) {
    return (
      <img
        src={character.avatarUrl}
        alt={character.name}
        onError={() => setImageFailed(true)}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200 text-4xl font-semibold text-neutral-400">
      {character.name?.[0]}
    </div>
  );
}

export default function CharacterListPage() {
  const [chars, setChars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/characters?mine=true")
      .then((r) => r.json())
      .then((d) => {
        setChars(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  const deleteCharacter = async (character: any) => {
    if (deletingId) return;
    if (!window.confirm(`Delete "${character.name}"? This removes its conversations, analytics, and links.`)) return;

    setDeletingId(character.id);
    try {
      const res = await fetch("/api/characters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: character.id }),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || "Failed to delete character");
      setChars((current) => current.filter((item) => item.id !== character.id));
    } catch (error: any) {
      alert(error.message || "Failed to delete character");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Characters</h1><p className="mt-1 text-sm text-muted-foreground">Create and manage your Echo characters.</p></div>
        <Link href="/creator/character/new" className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-white hover:opacity-80"><Plus className="h-3.5 w-3.5" />New Character</Link>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : chars.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-20 text-center"><p className="mb-2 text-sm text-muted-foreground">No characters yet.</p><Link href="/creator/character/new" className="text-sm font-medium underline">Create your first character</Link></div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {chars.map((character: any) => (
            <article key={character.id} className="group overflow-hidden rounded-[28px] border border-border/60 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-neutral-200/70">
              <div className="relative aspect-[5/4] overflow-hidden bg-neutral-100">
                <CharacterArt character={character} />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{character.name}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/75">{character.status}</p>
                  </div>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">{character._count?.conversations || 0} chats</span>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{character.bio}</p>

                <div className="flex flex-wrap gap-2">
                  {character.voice && <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-700"><Volume2 className="h-3 w-3" /> Voice</span>}
                  {(character.idleVideoUrl || character.speakingVideoUrl) && <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-700"><Video className="h-3 w-3" /> Video</span>}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-700"><MessageCircle className="h-3 w-3" /> {character._count?.conversations || 0} conversations</span>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Link href={`/creator/character/${character.id}`} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 text-[13px] font-medium text-white hover:opacity-85">
                    Manage <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => deleteCharacter(character)}
                    disabled={deletingId === character.id}
                    className={cn("flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-[13px] font-medium text-red-600 hover:bg-red-50", deletingId === character.id && "opacity-50")}
                  >
                    {deletingId === character.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
