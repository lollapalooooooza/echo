"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AudioLines, Check, ChevronRight, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";

import type { UserProfile } from "@/types";

export default function SettingsPage() {
  const { data: session } = useSession();
  const sessionUserId = (session?.user as any)?.id as string | undefined;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    username: "",
    bio: "",
  });

  useEffect(() => {
    if (!sessionUserId) return;

    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);

    fetch("/api/user")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load profile");
        return data as UserProfile;
      })
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setProfileForm({
          name: data.name || "",
          username: data.username || "",
          bio: data.bio || "",
        });
      })
      .catch((error: Error) => {
        if (!cancelled) setProfileError(error.message);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileMessage(null);
    setProfileError(null);

    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save profile");

      setProfile(data);
      setProfileForm({
        name: data.name || "",
        username: data.username || "",
        bio: data.bio || "",
      });
      setProfileMessage("Profile saved.");
    } catch (error: any) {
      setProfileError(error.message);
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Settings</h1></div>

      {/* Profile */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold mb-3">Profile</h3>
        <div className="flex items-center gap-3">
          {session?.user?.image ? <img src={session.user.image} alt="" className="h-12 w-12 rounded-full" /> : <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center font-bold">{session?.user?.name?.[0]}</div>}
          <div>
            <p className="text-[15px] font-semibold">{profile?.name || session?.user?.name}</p>
            <p className="text-sm text-muted-foreground">{profile?.email || session?.user?.email}</p>
            {profile?.username && <p className="text-xs text-muted-foreground">@{profile.username}</p>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium">Display name</label>
            <input
              value={profileForm.name}
              onChange={(e) => setProfileForm((current) => ({ ...current, name: e.target.value }))}
              placeholder="Your name"
              className="h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">Username</label>
            <input
              value={profileForm.username}
              onChange={(e) => setProfileForm((current) => ({ ...current, username: e.target.value }))}
              placeholder="your-handle"
              className="h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-foreground"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Used as your unique app identity. Letters, numbers, hyphens, and underscores only.</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[13px] font-medium">Bio</label>
          <textarea
            value={profileForm.bio}
            onChange={(e) => setProfileForm((current) => ({ ...current, bio: e.target.value }))}
            rows={4}
            placeholder="Tell people a little about yourself."
            className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-foreground"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleProfileSave}
            disabled={profileLoading || profileSaving}
            className="flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-white hover:opacity-80 disabled:opacity-50"
          >
            {profileSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {profileSaving ? "Saving…" : "Save Profile"}
          </button>
          {profileLoading && <p className="text-[12px] text-muted-foreground">Loading profile…</p>}
          {profileMessage && <p className="text-[12px] text-emerald-600">{profileMessage}</p>}
          {profileError && <p className="text-[12px] text-red-600">{profileError}</p>}
        </div>

        {profile?.createdAt && (
          <p className="text-[11px] text-muted-foreground">
            User record created on {new Date(profile.createdAt).toLocaleDateString()}.
          </p>
        )}
      </div>

      <div className="rounded-[28px] border border-border bg-[linear-gradient(160deg,#f8fafc,#ffffff)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <AudioLines className="h-4 w-4" />
              Voice Library
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Voice cloning now lives in its own dedicated workspace. Manage custom voices, preview them, see which characters already use them, and assign them later while creating or editing a character.
            </p>
          </div>
          <Link
            href="/creator/voice"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            Open voice library
            <ChevronRight className="h-4 w-4" />
          </Link>
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
