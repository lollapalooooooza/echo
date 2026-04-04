import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureUserProfile } from "@/services/user";

const DEV_USER_ID = "dev-user-000";

// On Vercel, VERCEL_URL is the deployment-specific URL (changes per deploy),
// but VERCEL_PROJECT_PRODUCTION_URL is the stable canonical domain.
// If NEXTAUTH_URL is not explicitly set, NextAuth auto-detects from VERCEL_URL,
// which can differ from the canonical domain — causing the OAuth state-cookie to
// be set on one origin while the callback arrives on another, triggering
// OAUTH_CALLBACK_HANDLER_ERROR.  We pin it to the stable URL before NextAuth
// reads it during module initialisation.
if (!process.env.NEXTAUTH_URL) {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  } else if (process.env.VERCEL_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as any,
  logger: {
    error(code, metadata) {
      // Log the full error (Vercel truncates console output, so we stringify
      // the metadata so the inner error message is visible in runtime logs)
      const detail =
        metadata instanceof Error
          ? metadata.message
          : typeof metadata === "object"
          ? JSON.stringify(metadata)
          : String(metadata);
      console.error(`[NextAuth] ${code} — ${detail}`);
    },
    warn(code) {
      console.warn(`[NextAuth] WARN ${code}`);
    },
  },
  providers: [
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          // Allow NextAuth to link a Google sign-in to an existing User row that
          // has the same email but no linked Account yet.  This fixes the
          // OAuthAccountNotLinked error that occurs when a prior sign-in attempt
          // created the User row but failed before writing the Account row.
          allowDangerousEmailAccountLinking: true,
        })]
      : []),
    ...(env.GITHUB_ID && env.GITHUB_SECRET
      ? [GitHubProvider({
          clientId: env.GITHUB_ID,
          clientSecret: env.GITHUB_SECRET,
          allowDangerousEmailAccountLinking: true,
        })]
      : []),
    ...(env.NEXT_PUBLIC_DEV_AUTH === "true"
      ? [CredentialsProvider({
          id: "dev",
          name: "Dev Account",
          credentials: {},
          async authorize() {
            const user = await db.user.upsert({
              where: { id: DEV_USER_ID },
              create: { id: DEV_USER_ID, name: "Dev User", email: "dev@localhost" },
              update: {},
            });
            return user;
          },
        })]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (user?.id) {
        try {
          await ensureUserProfile({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          });
        } catch (err) {
          // Don't block sign-in if profile sync fails — user can still authenticate
          console.error("[NextAuth] ensureUserProfile error:", err);
        }
      }

      return true;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      try {
        const redirectUrl = new URL(url);
        if (redirectUrl.origin === baseUrl) {
          return url;
        }
      } catch {
        // Fall through to the safe default below.
      }

      return `${baseUrl}/creator`;
    },
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).id = token.id;
      return session;
    },
  },
  pages: { signIn: "/auth" },
  secret: env.NEXTAUTH_SECRET,
};
