"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Camera,
  Check,
  Code,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Trash2,
  Video,
  X,
} from "lucide-react";

import { KnowledgeSelection } from "@/components/knowledge-selection";
import { VoiceSelectionPanel } from "@/components/voice-selection-panel";
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

export default function EditCharacterPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [char, setChar] = useState<any>(null);
  const [voices, setVoices] = useState<{ presets: any[]; custom: any[] }>({ presets: [], custom: [] });
  const [knowledgeSources, setKnowledgeSources] = useState<any[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(true);
  const [runwayAvatar, setRunwayAvatar] = useState<any>(null);
  const [runwayAvatarLoading, setRunwayAvatarLoading] = useState(false);
  const [regeneratingRunwayAvatar, setRegeneratingRunwayAvatar] = useState(false);
  const [runwayAvatarError, setRunwayAvatarError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [genVideo, setGenVideo] = useState(false);
  const [copied, setCopied] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarDrag, setAvatarDrag] = useState(false);

  const loadVoices = async () => {
    const voicesRes = await fetch("/api/voice/list", { cache: "no-store" });
    const voicesData = await readResponse(voicesRes);
    if (!voicesRes.ok) {
      throw new Error(voicesData.error || "Failed to load voices");
    }
    setVoices(voicesData);
  };

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (!data.avatarUrl) throw new Error("Upload failed");

      const avatarUrl = data.avatarUrl as string;
      setChar((p: any) => ({ ...p, avatarUrl }));
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setAvatarDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) uploadAvatar(file);
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [charactersRes, sourcesRes, voicesRes] = await Promise.all([
          fetch("/api/characters?mine=true", { cache: "no-store" }),
          fetch("/api/knowledge/sources", { cache: "no-store" }),
          fetch("/api/voice/list", { cache: "no-store" }),
        ]);

        const [charactersData, sourcesData, voicesData] = await Promise.all([
          readResponse(charactersRes),
          readResponse(sourcesRes),
          readResponse(voicesRes),
        ]);

        if (!charactersRes.ok) {
          throw new Error(charactersData.error || "Failed to load characters");
        }

        const current = (Array.isArray(charactersData) ? charactersData : []).find((item: any) => item.id === params.id);
        if (!current) {
          router.push("/creator/character");
          return;
        }

        if (cancelled) return;

        setChar({
          ...current,
          voiceId:
            current.voice && !current.voice.isDefault && !String(current.voice.id || "").startsWith("preset_")
              ? current.voice.id
              : current.voice?.elevenLabsVoiceId || "",
          voiceName: current.voice?.name || "",
          knowledgeSourceIds: current.knowledgeSources?.map((link: any) => link.source.id) || [],
        });

        if (voicesRes.ok) {
          setVoices(voicesData);
        } else {
          console.error("[EditCharacter] Failed to load voices:", voicesData.error);
          setVoices({ presets: [], custom: [] });
        }

        if (sourcesRes.ok) {
          const sources = Array.isArray(sourcesData) ? sourcesData : sourcesData.sources || [];
          setKnowledgeSources(sources.filter((source: any) => source.status === "INDEXED"));
        } else {
          console.error("[EditCharacter] Failed to load knowledge sources:", sourcesData.error);
          setKnowledgeSources([]);
        }
      } catch (e: any) {
        if (!cancelled) {
          alert(e.message || "Failed to load character");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingKnowledge(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  const refreshRunwayAvatar = async (characterId: string) => {
    setRunwayAvatarLoading(true);
    setRunwayAvatarError("");
    try {
      const res = await fetch(`/api/runway/avatar?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" });
      const data = await readResponse(res);
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

  const regenerateRunwayAvatar = async () => {
    if (!char?.id) return;

    setRegeneratingRunwayAvatar(true);
    setRunwayAvatarError("");
    try {
      const res = await fetch("/api/runway/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: char.id }),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || "Failed to generate Runway avatar");

      setRunwayAvatar(data.avatar || null);
      setChar((prev: any) => ({
        ...prev,
        runwayCharacterId: data.runwayCharacterId || prev.runwayCharacterId,
      }));
    } catch (e: any) {
      setRunwayAvatarError(e.message || "Failed to generate Runway avatar");
    } finally {
      setRegeneratingRunwayAvatar(false);
    }
  };

  const toggleSourceIds = (sourceIds: string[]) => {
    setChar((prev: any) => {
      const ids = prev.knowledgeSourceIds || [];
      const hasAll = sourceIds.every((sourceId) => ids.includes(sourceId));
      return {
        ...prev,
        knowledgeSourceIds: hasAll
          ? ids.filter((id: string) => !sourceIds.includes(id))
          : Array.from(new Set([...ids, ...sourceIds])),
      };
    });
  };

  const toggleAllSources = () => {
    setChar((prev: any) => {
      const ids = prev.knowledgeSourceIds || [];
      const allSelected = knowledgeSources.length > 0 && ids.length === knowledgeSources.length;
      return {
        ...prev,
        knowledgeSourceIds: allSelected ? [] : knowledgeSources.map((source) => source.id),
      };
    });
  };

  const save = async () => {
    if (!char) return;
    setSaving(true);
    try {
      const res = await fetch("/api/characters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(char),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || "Failed to save character");
    } catch (e: any) {
      alert(e.message || "Failed to save character");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    const newStatus = char.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    setChar((p: any) => ({ ...p, status: newStatus }));
    try {
      const res = await fetch("/api/characters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: char.id, status: newStatus }),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || "Failed to update status");
    } catch (e: any) {
      setChar((p: any) => ({ ...p, status: char.status }));
      alert(e.message || "Failed to update status");
    }
  };

  const generateVideo = async (action: string) => {
    setGenVideo(true);
    try {
      const res = await fetch("/api/video/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: char.id, action }) });
      const data = await readResponse(res);
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

  const deleteCharacter = async () => {
    if (!char?.id || deleting) return;
    if (!window.confirm(`Delete "${char.name}"? This removes its conversations, analytics, and knowledge links.`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/characters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: char.id }),
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || "Failed to delete character");
      router.push("/creator/character");
    } catch (e: any) {
      alert(e.message || "Failed to delete character");
    } finally {
      setDeleting(false);
    }
  };

  const copyText = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 2000); };

  if (loading || !char) return <div className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://your-echonest-domain.com";
  const scriptSnippet = `<script src="${appUrl}/widget.js" data-character-id="${char.id}" data-position="${char.widgetPosition || "bottom-right"}" async></script>`;
  const iframeSnippet = `<iframe src="${appUrl}/embed/${char.id}" width="400" height="600" style="border:none;border-radius:16px" allow="microphone"></iframe>`;
  const runwayAvatarStatus = typeof runwayAvatar?.status === "string" ? runwayAvatar.status.toUpperCase() : "";
  const canGenerateRunwayAvatar = !!char.avatarUrl;
  const showRunwayGenerateButton = canGenerateRunwayAvatar && (!char.runwayCharacterId || runwayAvatarStatus === "FAILED");
  const liveSessionDisabled = !char.runwayCharacterId || runwayAvatarStatus === "FAILED";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{char.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{char.status} · {char._count?.conversations || 0} conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={deleteCharacter} disabled={deleting} className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-3 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
          <button onClick={togglePublish} className={cn("flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium", char.status === "PUBLISHED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border hover:bg-muted/30")}>
            {char.status === "PUBLISHED" ? "✓ Published" : "Publish"}
          </button>
          <button onClick={save} disabled={saving} className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-white hover:opacity-80 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold">Identity</h3>
          <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              <label className="mb-1 block text-[13px] font-medium">Avatar</label>
              <div
                className={cn("relative flex h-56 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed transition-colors", avatarDrag ? "border-foreground bg-muted/20" : "border-border hover:border-foreground/30")}
                onClick={() => avatarRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setAvatarDrag(true); }}
                onDragLeave={() => setAvatarDrag(false)}
                onDrop={handleAvatarDrop}
              >
                {char.avatarUrl ? (
                  <div className="relative h-full w-full">
                    <img src={char.avatarUrl} alt="Avatar" className="h-full w-full rounded-2xl object-cover" />
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

            <div className="space-y-3">
              <div><label className="mb-1 block text-[13px] font-medium">Name</label><input value={char.name} onChange={e => setChar((p: any) => ({ ...p, name: e.target.value }))} className="h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-foreground" /></div>
              <div><label className="mb-1 block text-[13px] font-medium">Bio</label><textarea value={char.bio} onChange={e => setChar((p: any) => ({ ...p, bio: e.target.value }))} rows={3} className="w-full rounded-md border border-border p-3 text-sm outline-none resize-none focus:border-foreground" /></div>
              <div><label className="mb-1 block text-[13px] font-medium">Greeting</label><textarea value={char.greeting} onChange={e => setChar((p: any) => ({ ...p, greeting: e.target.value }))} rows={3} className="w-full rounded-md border border-border p-3 text-sm outline-none resize-none focus:border-foreground" /></div>
              <div>
                <label className="mb-1 block text-[13px] font-medium">Runway Avatar ID</label>
                <input value={char.runwayCharacterId || ""} onChange={e => setChar((p: any) => ({ ...p, runwayCharacterId: e.target.value }))} placeholder="Optional: avat_xxx" className="h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-foreground" />
                <p className="mt-1 text-[11px] text-muted-foreground">Use this for a true real-time avatar if you already have a Runway character ID.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4" /> Character Knowledge</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Choose the exact libraries this character should use. Website crawls are grouped by main domain so they are easier to pick.</p>
            </div>
            <a href="/creator/knowledge" className="text-[12px] font-medium text-foreground underline underline-offset-4 decoration-neutral-300 hover:decoration-neutral-500">
              Manage library
            </a>
          </div>
          <KnowledgeSelection
            sources={knowledgeSources}
            loading={loadingKnowledge}
            selectedSourceIds={char.knowledgeSourceIds || []}
            onToggleAll={toggleAllSources}
            onToggleItem={(item) => toggleSourceIds(item.sourceIds)}
          />
        </div>

        <div className="rounded-xl border border-border bg-white p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Character Voice</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Choose a preset or one of your cloned voices. EchoNest uses this voice for synthesized speech and widget playback, and Runway live sessions now auto-match the closest compatible live voice when the exact cloned voice cannot be passed through directly.
            </p>
          </div>

          <VoiceSelectionPanel
            voices={voices}
            selectedVoiceId={char.voiceId || ""}
            onSelect={({ voiceId, voiceName }) =>
              setChar((prev: any) => ({ ...prev, voiceId, voiceName }))
            }
            onClear={() => setChar((prev: any) => ({ ...prev, voiceId: "", voiceName: "" }))}
            previewText={char.greeting || `Hello, I'm ${char.name}.`}
            onLibraryRefresh={loadVoices}
          />
        </div>

        <div className="rounded-xl border border-border bg-white p-5 space-y-3">
          <h3 className="text-sm font-semibold">Runway Live Character</h3>
          <p className="text-[13px] text-muted-foreground">Manage the real-time Runway avatar used for live sessions and instant face-to-face conversations.</p>
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-[13px]">
            <p><span className="font-medium">Character ID:</span> {char.runwayCharacterId || "Not configured"}</p>
            <p className="mt-1">
              <span className="font-medium">Avatar status:</span>{" "}
              {runwayAvatarLoading ? "Loading…" : runwayAvatar?.status || (char.runwayCharacterId ? "Unknown" : "Unavailable")}
            </p>
            {runwayAvatar?.voice?.name && <p className="mt-1"><span className="font-medium">Voice:</span> {runwayAvatar.voice.name}</p>}
            {Array.isArray(runwayAvatar?.documentIds) && (
              <p className="mt-1">
                <span className="font-medium">Attached knowledge documents:</span> {runwayAvatar.documentIds.length}
              </p>
            )}
            {runwayAvatarError && <p className="mt-2 text-[12px] text-rose-600">{runwayAvatarError}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => char.id && refreshRunwayAvatar(char.id)} disabled={runwayAvatarLoading || !char.runwayCharacterId} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30 disabled:opacity-50">
              {runwayAvatarLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh status
            </button>
            {showRunwayGenerateButton && (
              <button onClick={regenerateRunwayAvatar} disabled={regeneratingRunwayAvatar} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30 disabled:opacity-50">
                {regeneratingRunwayAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                {runwayAvatarStatus === "FAILED" ? "Regenerate avatar" : "Generate avatar"}
              </button>
            )}
            <a href={`/room/${char.slug}`} target="_blank" className={cn("flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-white hover:opacity-80", liveSessionDisabled && "pointer-events-none opacity-50")}>
              <Play className="h-3.5 w-3.5" /> Live session test
            </a>
          </div>
          {!char.avatarUrl && <p className="text-[11px] text-amber-600">Upload a character image to generate a Runway live character.</p>}
          {char.runwayCharacterId && Array.isArray(runwayAvatar?.documentIds) && runwayAvatar.documentIds.length === 0 && (
            <p className="text-[11px] text-amber-600">Runway still shows zero attached knowledge documents for this avatar. Save the character again or regenerate the avatar to resync its knowledge.</p>
          )}
          {runwayAvatarStatus === "FAILED" && <p className="text-[11px] text-amber-600">Runway marked this avatar as failed. Regenerate it to restore live sessions.</p>}
        </div>

        <div className="rounded-xl border border-border bg-white p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Video className="h-4 w-4" /> Runway Fallback Video</h3>
          <p className="text-[13px] text-muted-foreground">These prerecorded clips are used as a fallback when a live Runway session is not available.</p>
          <div className="flex flex-wrap gap-2">
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
          {char.idleVideoUrl && <p className="text-[11px] text-emerald-600">✓ Idle video ready</p>}
          {char.speakingVideoUrl && <p className="text-[11px] text-emerald-600">✓ Speaking video ready</p>}
          {!char.avatarUrl && <p className="text-[11px] text-amber-600">Upload an avatar first.</p>}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Code className="h-4 w-4" /> Embed Widget</h3>
            <p className="text-[13px] text-muted-foreground">Add this script to embed your character as a floating widget.</p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-4 text-xs text-neutral-300" style={{ fontFamily: "var(--font-mono)" }}>{scriptSnippet}</pre>
              <button onClick={() => copyText(scriptSnippet, "script")} className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-md bg-white/10 px-2 text-[11px] text-white/60 hover:bg-white/20">
                {copied === "script" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold">Iframe Embed</h3>
            <p className="text-[13px] text-muted-foreground">Use the iframe when you want the conversation experience in a fixed container.</p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-4 text-xs text-neutral-300" style={{ fontFamily: "var(--font-mono)" }}>{iframeSnippet}</pre>
              <button onClick={() => copyText(iframeSnippet, "iframe")} className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-md bg-white/10 px-2 text-[11px] text-white/60 hover:bg-white/20">
                {copied === "iframe" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold">Direct Links</h3>
            <p className="text-[13px] text-muted-foreground">Open the hosted conversation room or standalone embed page directly.</p>
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
