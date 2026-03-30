"use client";
import { signIn, useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const callbackUrl = searchParams.get("callbackUrl") || "/creator";

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
      router.refresh();
    }
  }, [callbackUrl, router, status]);

  if (status === "authenticated" || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="rounded-[28px] border border-border bg-white px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {status === "authenticated" ? "Opening your EchoNest workspace..." : "Checking your session..."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8dc_0%,#fffdf7_28%,#ffffff_62%)] px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="hidden lg:block">
          <div className="rounded-[34px] border border-amber-200/60 bg-[linear-gradient(165deg,#fffdf4_0%,#fff6ce_55%,#fffaf0_100%)] p-8 shadow-[0_32px_100px_-55px_rgba(245,158,11,0.45)]">
            <BrandMark href="/" size="lg" showTagline />
            <h1 className="mt-8 text-[2.8rem] font-semibold leading-[1.02] tracking-tight text-slate-950" style={{ fontFamily: "var(--font-display)" }}>
              Bring your knowledge to life with EchoNest.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-600">
              Upload knowledge, give it a voice, and turn it into a live character people can actually talk to.
            </p>
            <div className="mt-8 overflow-hidden rounded-[28px] border border-amber-200/70 bg-white/70 p-5">
              <img
                src="/brand/echonest-mascot.png"
                alt="EchoNest mascot"
                className="mx-auto aspect-square w-full max-w-[22rem] object-contain"
              />
            </div>
          </div>
        </div>

        <div className="w-full max-w-md justify-self-center">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandMark href="/" size="md" showTagline />
          </div>
          <div className="rounded-[30px] border border-border bg-white p-7 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.32)]">
          <h1 className="mb-1 text-xl font-semibold" style={{fontFamily:"var(--font-display)"}}>Sign in to EchoNest</h1>
          <p className="mb-6 text-sm text-muted-foreground">Create, manage, and analyze your living knowledge characters.</p>

          <div className="space-y-3">
            <button onClick={() => signIn("google", { callbackUrl })}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-medium transition-colors hover:bg-muted/30">
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>
            <button onClick={() => signIn("github", { callbackUrl })}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-medium transition-colors hover:bg-muted/30">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              Continue with GitHub
            </button>

            {process.env.NEXT_PUBLIC_DEV_AUTH === "true" && (
              <>
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-muted-foreground">Dev</span></div>
                </div>
                <button onClick={() => signIn("dev", { callbackUrl })}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-300 bg-orange-50 text-sm font-medium text-orange-700 hover:bg-orange-100">
                  Sign in as Dev User
                </button>
              </>
            )}
          </div>
          <p className="mt-5 text-center text-[12px] text-muted-foreground">
            Sign-in will reopen your workspace automatically after the session is ready.
          </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="rounded-[28px] border border-border bg-white px-6 py-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Preparing sign-in...</span>
            </div>
          </div>
        </div>
      }
    >
      <AuthPageInner />
    </Suspense>
  );
}
