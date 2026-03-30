import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureUserProfile } from "@/services/user";

const DEV_USER_ID = "dev-user-000";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as any,
  providers: [
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })]
      : []),
    ...(env.GITHUB_ID && env.GITHUB_SECRET
      ? [GitHubProvider({ clientId: env.GITHUB_ID, clientSecret: env.GITHUB_SECRET })]
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
        await ensureUserProfile({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        });
      }

      return true;
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
