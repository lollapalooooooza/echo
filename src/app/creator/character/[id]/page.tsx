"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Video, Copy, Check, ExternalLink, Code, Play, Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EditCharacterPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [char, setChar] = useState<any>(null);
  const [runwayAvatar, setRunwayAvatar] = useState<any>(null);
  const [runwayAvatarLoading, setRunwayAvatarLoading] = useState(false);
  const [runwayAvatarError, setRunwayAvatarError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genVideo, setGenVideo] = useState(false);
  const [copied, setCopied] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarDrag, setAvatarDrag] = useState(false);

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const fd = new FormData(); fd.append("avatar", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json(); alert(e.error || "Upload failed"); return; }
      const { avatarUrl } = await res.json();
      setChar((p: any) => ({ ...p, avatarUrl }));
    } catch (e: any) { alert(e.message); }
    finally { setUploadingAvatar(false); }
  };
  const handleAvatarDrop = (e: React.DragEvent) => {
    e.preventDefault(); setAvatarDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) uploadAvatar(file);
  };

  useEffect(() => {
    fetch("/api/characters?mine=true").then(r => r.json()).then(chars => {
      const c = (Array.isArray(chars) ? chars : []).find((x: any) => x.id === params.id);
      if (c) setChar(c); else router.push("/creator/character");
    }).finally(() => setLoading(false));
  }, [params.id, router]);

  const refreshRunwayAvatar = async (characterId: string) => {
    setRunwayAvatarLoading(true);
    setRunwayAvatarError("");
    try {
      const res = await fetch(`/api/runway/avatar?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load Runway avatar");
      setRunwayAvatar(data.avatar || null);
    } catch (e: any) {
      setRunwayAvatar(null);
      setRunwayAvatarError(e.message || "Failed to load Runway avatar");
    } finally {
      setRunwayAvatarLoading(false);
    }
  };

  useEffect(() => {
    if (!char?.id || !char?.runwayCharacterId) {
      setRunwayAvatar(null);
      setRunwayAvatarError("");
      return;
    }
    refreshRunwayAvatar(char.id);
  }, [char?.id, char?.runwayCharacterId]);

  const save = async () => {
    setSaving(true);
    await fetch("/api/characters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(char) });
    setSaving(false);
  };

  const togglePublish = async () => {
    const newStatus = char.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    setChar((p: any) => ({ ...p, status: newStatus }));
    await fetch("/api/characters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: char.id, status: newStatus }) });
  };

  const generateVideo = async (action: string) => {
    setGenVideo(true);
    try {
      const res = await fetch("/api/video/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: char.id, action }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Video generation failed");
      if (data.error) alert(data.error);
      setChar((p: any) => ({
        ...p,
        idleVideoUrl: data.idleVideoUrl ?? p.idleVideoUrl,
        speakingVideoUrl: data.speakingVideoUrl ?? p.speakingVideoUrl,
      }));
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Video generation failed");
    }
    setGenVideo(false);
  };

  const copyText = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 2000); };

  if (loading || !char) return <div className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://your-echo-domain.com";
  const scriptSnippet = `<script src="${appUrl}/widget.js" data-character-id="${char.id}" data-position="${char.widgetPosition || "bottom-right"}" async></script>`;
  const iframeSnippet = `<iframe src="${appUrl}/embed/${char.id}" width="400" height="600" style="border:none;border-radius:16px" allow="microphone"></iframe>`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{char.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{char.status} · {char._count?.conversations || 0} conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={togglePublish} className={cn("flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium", char.status === "PUBLISHED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border hover:bg-muted/30")}>
            {char.status === "PUBLISHED" ? "✓ Published" : "Publish"}
          </button>
          <button onClick={save} disabled={saving} className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-white hover:opacity-80 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit fields */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold">Identity</h3>
            <div><label className="mb-1 block text-[13px] font-medium">Name</label><input value={char.name} onChange={e => setChar((p: any) => ({ ...p, name: e.target.value }))} className="h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-foreground" /></div>
            <div>
              <label className="mb-1 block text-[13px] font-medium">Avatar</label>
              <div className={cn("relative flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-colors", avatarDrag ? "border-foreground bg-muted/20" : "border-border hover:border-foreground/30")}
                onClick={() => avatarRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setAvatarDrag(true); }} onDragLeave={() => setAvatarDrag(false)} onDrop={handleAvatarDrop}>
                {char.avatarUrl ? (
                  <div className="relative h-full w-full">
                    <img src={char.avatarUrl} alt="Avatar" className="h-full w-full rounded-lg object-cover" />
                    <button onClick={e => { e.stopPropagation(); setChar((p: any) => ({ ...p, avatarUrl: "" })); }} className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"><X className="h-3 w-3" /></button>
                  </div>
                ) : uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <div className="text-center"><Camera className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-1 text-[11px] text-muted-foreground">Click or drag to upload</p></div>
                )}
                <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium">Runway Avatar ID</label>
              <input value={char.runwayCharacterId || ""} onChange={e => setChar((p: any) => ({ ...p, runwayCharacterId: e.target.value }))} placeholder="Optional: avat_xxx" className="h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-foreground" />
              <p className="mt-1 text-[11px] text-muted-foreground">Use this for a true real-time Runway avatar. The uploaded image and generated clips are a separate fallback path.</p>
            </div>
            <div><label className="mb-1 block text-[13px] font-medium">Bio</label><textarea value={char.bio} onChange={e => setChar((p: any) => ({ ...p, bio: e.target.value }))} rows={3} className="w-full rounded-md border border-border p-3 text-sm outline-none resize-none focus:border-foreground" /></div>
            <div><label className="mb-1 block text-[13px] font-medium">Greeting</label><textarea value={char.greeting} onChange={e => setChar((p: any) => ({ ...p, greeting: e.target.value }))} rows={3} className="w-full rounded-md border border-border p-3 text-sm outline-none resize-none focus:border-foreground" /></div>
          </div>

          {/* Runway Video */}
          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Video className="h-4 w-4" /> Runway Video Character</h3>
            <p className="text-[13px] text-muted-foreground">This section manages clip-based fallback video. A real-time avatar uses the Runway Avatar ID above and a different session flow.</p>
            <div className="flex gap-2">
              <button onClick={() => generateVideo("idle")} disabled={genVideo || !char.avatarUrl} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30 disabled:opacity-50">
                {genVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} Generate Idle
              </button>
              <button onClick={() => generateVideo("speaking")} disabled={genVideo || !char.avatarUrl} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30 disabled:opacity-50">
                {genVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} Generate Speaking
              </button>
              <button onClick={() => generateVideo("both")} disabled={genVideo || !char.avatarUrl} className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-white hover:opacity-80 disabled:opacity-50">
                {genVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} Generate Both
              </button>
            </div>
            {char.runwayCharacterId && <p className="text-[11px] text-sky-600">Runway live avatar configured: {char.runwayCharacterId}</p>}
            {char.idleVideoUrl && <p className="text-[11px] text-emerald-600">✓ Idle video ready</p>}
            {char.speakingVideoUrl && <p className="text-[11px] text-emerald-600">✓ Speaking video ready</p>}
            {!char.avatarUrl && <p className="text-[11px] text-amber-600">Upload an avatar first.</p>}
          </div>

          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold">Runway Live Session</h3>
            <p className="text-[13px] text-muted-foreground">Character ID and live session testing for the Runway avatar bound to this character.</p>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-[13px]">
              <p><span className="font-medium">Character ID:</span> {char.runwayCharacterId || "Not configured"}</p>
              <p className="mt-1">
                <span className="font-medium">Avatar status:</span>{" "}
                {runwayAvatarLoading ? "Loading…" : runwayAvatar?.status || (char.runwayCharacterId ? "Unknown" : "Unavailable")}
              </p>
              {runwayAvatar?.voice?.name && <p className="mt-1"><span className="font-medium">Voice:</span> {runwayAvatar.voice.name}</p>}
              {runwayAvatarError && <p className="mt-2 text-[12px] text-rose-600">{runwayAvatarError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => char.id && refreshRunwayAvatar(char.id)} disabled={runwayAvatarLoading || !char.runwayCharacterId} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30 disabled:opacity-50">
                {runwayAvatarLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} Refresh status
              </button>
              <a href={`/room/${char.slug}`} target="_blank" className={cn("flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-white hover:opacity-80", !char.runwayCharacterId && "pointer-events-none opacity-50")}>
                <Play className="h-3.5 w-3.5" /> Live session test
              </a>
            </div>
          </div>
        </div>

        {/* Embed codes */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Code className="h-4 w-4" /> Embed Widget</h3>
            <p className="text-[13px] text-muted-foreground">Add this script to any website to embed your character as a chat widget.</p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-4 text-xs text-neutral-300" style={{ fontFamily: "var(--font-mono)" }}>{scriptSnippet}</pre>
              <button onClick={() => copyText(scriptSnippet, "script")} className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-md bg-white/10 px-2 text-[11px] text-white/60 hover:bg-white/20">
                {copied === "script" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold">Iframe Embed</h3>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-4 text-xs text-neutral-300" style={{ fontFamily: "var(--font-mono)" }}>{iframeSnippet}</pre>
              <button onClick={() => copyText(iframeSnippet, "iframe")} className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-md bg-white/10 px-2 text-[11px] text-white/60 hover:bg-white/20">
                {copied === "iframe" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold">Direct Links</h3>
            <div className="space-y-2">
              <a href={`/room/${char.slug}`} target="_blank" className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground">
                <Play className="h-3.5 w-3.5" /> Conversation room: {appUrl}/room/{char.slug} <ExternalLink className="h-3 w-3" />
              </a>
              <a href={`/embed/${char.id}`} target="_blank" className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground">
                <Code className="h-3.5 w-3.5" /> Widget page: {appUrl}/embed/{char.id} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
