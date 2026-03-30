"use client";
import { useState, useRef } from "react";
import { Mic, Upload, Loader2, Check, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [cloneName, setCloneName] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClone = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !cloneName.trim()) { alert("Select an audio file and enter a name."); return; }
    setCloning(true);
    try {
      const form = new FormData();
      form.append("name", cloneName);
      form.append("audio", file);
      const res = await fetch("/api/voice/clone", { method: "POST", body: form });
      const data = await res.json();
      if (data.voiceId) setCloneResult(data.voiceId);
      else alert(data.error || "Clone failed");
    } catch (e: any) { alert(e.message); }
    setCloning(false);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Settings</h1></div>

      {/* Profile */}
      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="text-sm font-semibold mb-3">Profile</h3>
        <div className="flex items-center gap-3">
          {session?.user?.image ? <img src={session.user.image} alt="" className="h-12 w-12 rounded-full" /> : <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center font-bold">{session?.user?.name?.[0]}</div>}
          <div><p className="text-[15px] font-semibold">{session?.user?.name}</p><p className="text-sm text-muted-foreground">{session?.user?.email}</p></div>
        </div>
      </div>

      {/* Voice Cloning */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Mic className="h-4 w-4" /> Clone Your Voice</h3>
        <p className="text-[13px] text-muted-foreground">Upload a 30-second to 5-minute audio sample of your voice. ElevenLabs will create a cloned voice you can assign to your characters.</p>

        <div className="space-y-3">
          <div><label className="mb-1 block text-[13px] font-medium">Voice name</label><input value={cloneName} onChange={e => setCloneName(e.target.value)} placeholder="e.g. My Voice" className="h-9 w-full max-w-sm rounded-md border border-border px-3 text-sm outline-none focus:border-foreground" /></div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">Audio sample (MP3, WAV, M4A)</label>
            <input ref={fileRef} type="file" accept="audio/*" className="text-sm" />
          </div>
          <button onClick={handleClone} disabled={cloning} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-white hover:opacity-80 disabled:opacity-50">
            {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {cloning ? "Cloning…" : "Clone Voice"}
          </button>
          {cloneResult && <p className="flex items-center gap-1.5 text-[13px] text-emerald-600"><Check className="h-4 w-4" /> Voice cloned! ID: {cloneResult}. Select it when creating a character.</p>}
        </div>
      </div>

      {/* API Keys info */}
      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="text-sm font-semibold mb-2">Connected Services</h3>
        <div className="space-y-1.5 text-[13px] text-muted-foreground">
          <p>• Anthropic Claude — AI responses</p>
          <p>• OpenAI — Text embeddings</p>
          <p>• ElevenLabs — Voice synthesis</p>
          <p>• Runway — Video character generation</p>
          <p>• Firecrawl — Website crawling</p>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">API keys are configured server-side in .env.local</p>
      </div>
    </div>
  );
}
