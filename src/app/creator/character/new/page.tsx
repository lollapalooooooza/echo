"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Plus, X, Camera, BookOpen } from "lucide-react";

import { KnowledgeSelection } from "@/components/knowledge-selection";
import { VoiceSelectionPanel } from "@/components/voice-selection-panel";
import { cn } from "@/lib/utils";

const TONES = ["friendly", "professional", "casual", "witty", "academic", "storyteller"];

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

export default function NewCharacterPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [voices, setVoices] = useState<{ presets: any[]; custom: any[] }>({ presets: [], custom: [] });
  const [knowledgeSources, setKnowledgeSources] = useState<any[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(true);
  const [form, setForm] = useState({
    name: "", bio: "", greeting: "", personalityTone: "friendly", avatarUrl: "",
    voiceId: "", voiceName: "", runwayCharacterId: "",
    suggestedQuestions: [""], publish: true,
    allowedDomains: [""], widgetTheme: "light", widgetPosition: "bottom-right",
    knowledgeSourceIds: [] as string[],
  });
  const [newQ, setNewQ] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarDrag, setAvatarDrag] = useState(false);

  const loadVoices = async () => {
    try {
      const response = await fetch("/api/voice/list", { cache: "no-store" });
      const data = await readResponse(response);
      if (response.ok) {
        setVoices(data);
      }
    } catch {
      /* keep existing voice options */
    }
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
      set("avatarUrl", avatarUrl);
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarDrop = (e: React.DragEvent) => {
    e.preventDefault(); setAvatarDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) uploadAvatar(file);
  };

  useEffect(() => {
    void loadVoices();
    fetch("/api/knowledge/sources")
      .then((r) => r.json())
      .then((data) => {
        const sources = Array.isArray(data) ? data : data.sources || [];
        setKnowledgeSources(sources.filter((s: any) => s.status === "INDEXED"));
        setLoadingKnowledge(false);
      })
      .catch(() => setLoadingKnowledge(false));
  }, []);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const addQ = () => { if (!newQ.trim()) return; set("suggestedQuestions", [...form.suggestedQuestions.filter(Boolean), newQ.trim()]); setNewQ(""); };
  const rmQ = (i: number) => set("suggestedQuestions", form.suggestedQuestions.filter((_, j) => j !== i));

  const toggleSourceIds = (sourceIds: string[]) => {
    const hasAll = sourceIds.every((sourceId) => form.knowledgeSourceIds.includes(sourceId));
    if (hasAll) {
      set("knowledgeSourceIds", form.knowledgeSourceIds.filter((id) => !sourceIds.includes(id)));
    } else {
      set("knowledgeSourceIds", Array.from(new Set([...form.knowledgeSourceIds, ...sourceIds])));
    }
  };

  const toggleAllSources = () => {
    if (form.knowledgeSourceIds.length === knowledgeSources.length) {
      set("knowledgeSourceIds", []);
    } else {
      set("knowledgeSourceIds", knowledgeSources.map((s) => s.id));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.bio.trim() || !form.greeting.trim()) {
      alert("Name, bio, and greeting are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          suggestedQuestions: form.suggestedQuestions.filter(Boolean),
          allowedDomains: form.allowedDomains.filter(Boolean),
        }),
      });
      const data = await readResponse(res);
      if (!res.ok) {
        alert(data.error || "Failed");
        setSaving(false);
        return;
      }
      const char = data;

      if (char.avatarUrl) {
        setGeneratingVideo(true);
        try {
          const videoRes = await fetch("/api/video/generate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ characterId: char.id, action: "both" }),
          });
          const videoData = await readResponse(videoRes);
          if (!videoRes.ok) console.warn("Video generation failed:", videoData?.error || `API ${videoRes.status}`);
        } catch (e) { console.warn("Video generation failed:", e); }
        setGeneratingVideo(false);
      }

      router.push(`/creator/character/${char.id}`);
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Create Character</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set up identity, knowledge, Echo playback voice, and the Runway avatar link.</p>
        </div>
        <button onClick={handleSave} disabled={saving || generatingVideo}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-5 text-[13px] font-medium text-white hover:opacity-80 disabled:opacity-50 transition-opacity">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : generatingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Creating…" : generatingVideo ? "Generating video…" : "Create & Publish"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identity */}
        <Section title="Identity">
          <Field label="Character name">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. James's Brain"
              className="h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-foreground transition-colors" />
          </Field>
          <Field label="Avatar">
            <div className={cn("relative flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-colors",
              avatarDrag ? "border-foreground bg-muted/20" : "border-border hover:border-foreground/30")}
              onClick={() => avatarRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setAvatarDrag(true); }}
              onDragLeave={() => setAvatarDrag(false)}
              onDrop={handleAvatarDrop}>
              {form.avatarUrl ? (
                <div className="relative h-full w-full">
                  <img src={form.avatarUrl} alt="Avatar" className="h-full w-full rounded-xl object-cover" />
                  <button onClick={(e) => { e.stopPropagation(); set("avatarUrl", ""); }}
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"><X className="h-3 w-3" /></button>
                </div>
              ) : uploadingAvatar ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-center"><Camera className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-1 text-[11px] text-muted-foreground">Click or drag to upload</p></div>
              )}
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
            </div>
          </Field>
          <Field label="Bio"><textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={3} placeholder="Describe what this character knows…"
            className="w-full rounded-lg border border-border p-3 text-sm outline-none resize-none focus:border-foreground transition-colors" /></Field>
          <Field label="Greeting message"><textarea value={form.greeting} onChange={(e) => set("greeting", e.target.value)} rows={3} placeholder="First message visitors see…"
            className="w-full rounded-lg border border-border p-3 text-sm outline-none resize-none focus:border-foreground transition-colors" /></Field>
        </Section>

        {/* Knowledge Base Selection */}
        <Section title="Knowledge Base" icon={<BookOpen className="h-4 w-4" />}>
          <p className="text-[13px] text-muted-foreground mb-3">
            Select which knowledge sources this character can reference. If none selected, the character uses all your knowledge.
          </p>
          <KnowledgeSelection
            sources={knowledgeSources}
            loading={loadingKnowledge}
            selectedSourceIds={form.knowledgeSourceIds}
            onToggleAll={toggleAllSources}
            onToggleItem={(item) => toggleSourceIds(item.sourceIds)}
          />
        </Section>

        {/* Personality */}
        <Section title="Personality & Tone">
          <Field label="Tone">
            <div className="grid grid-cols-3 gap-2">
              {TONES.map((t) => (
                <button key={t} onClick={() => set("personalityTone", t)}
                  className={cn("rounded-lg border px-3 py-2 text-[13px] font-medium capitalize transition-colors",
                    form.personalityTone === t ? "border-foreground bg-foreground text-white" : "border-border hover:border-foreground/30")}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Suggested questions">
            <div className="space-y-2">
              {form.suggestedQuestions.filter(Boolean).map((q, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="flex-1 text-[13px]">{q}</span>
                  <button onClick={() => rmQ(i)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Add question…"
                  className="h-8 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus:border-foreground transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && addQ()} />
                <button onClick={addQ} className="flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[13px] hover:bg-muted/30 transition-colors">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          </Field>
        </Section>

        {/* Voice */}
        <Section title="Voice">
          <VoiceSelectionPanel
            voices={voices}
            selectedVoiceId={form.voiceId}
            onSelect={({ voiceId, voiceName }) => {
              set("voiceId", voiceId);
              set("voiceName", voiceName);
            }}
            onClear={() => {
              set("voiceId", "");
              set("voiceName", "");
            }}
            previewText={form.greeting || "Hello! I'm your AI knowledge character."}
            onLibraryRefresh={loadVoices}
          />
        </Section>

        {/* Live Avatar */}
        <Section title="Live Avatar">
          <Field label="Runway Avatar ID Override">
            <input value={form.runwayCharacterId} onChange={(e) => set("runwayCharacterId", e.target.value)}
              placeholder="Optional existing avat_xxx"
              className="h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-foreground transition-colors" />
            <p className="mt-1 text-[11px] text-muted-foreground">Paste an existing Runway avatar ID to use it as-is. If you leave this blank, Echo will create the character without any Runway avatar attached; you can generate one later from the edit page if you want a brand-new Runway avatar.</p>
          </Field>
        </Section>

        {/* Widget Settings */}
        <Section title="Widget Settings">
          <Field label="Position">
            <div className="flex gap-2">
              {["bottom-right", "bottom-left"].map((p) => (
                <button key={p} onClick={() => set("widgetPosition", p)}
                  className={cn("flex-1 rounded-lg border px-3 py-2 text-[13px] capitalize transition-colors",
                    form.widgetPosition === p ? "border-foreground bg-foreground/5" : "border-border")}>
                  {p.replace("-", " ")}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Theme">
            <div className="flex gap-2">
              {["light", "dark"].map((t) => (
                <button key={t} onClick={() => set("widgetTheme", t)}
                  className={cn("flex-1 rounded-lg border px-3 py-2 text-[13px] capitalize transition-colors",
                    form.widgetTheme === t ? "border-foreground bg-foreground/5" : "border-border")}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Allowed domains">
            <textarea value={form.allowedDomains.join("\n")} onChange={(e) => set("allowedDomains", e.target.value.split("\n"))}
              rows={2} placeholder="example.com&#10;localhost"
              className="w-full rounded-lg border border-border p-3 text-sm outline-none resize-none focus:border-foreground transition-colors" />
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white shadow-sm">
      <div className="border-b border-border/40 px-5 py-3.5 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1.5 block text-[13px] font-medium">{label}</label>{children}</div>;
}
