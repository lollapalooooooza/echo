import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

const nextAuthHandler = NextAuth(authOptions);

// Diagnostic wrapper: log the raw query params on the Google callback so we can
// see exactly what error (if any) Google is sending back.
async function GET(req: NextRequest, ctx: { params: { nextauth: string[] } }) {
  const segments = ctx.params.nextauth;
  if (segments?.join("/") === "callback/google") {
    const { searchParams } = req.nextUrl;
    const error = searchParams.get("error");
    const state = searchParams.get("state");
    const code = searchParams.get("code");
    console.log(
      "[Auth callback/google]",
      JSON.stringify({
        error,
        error_description: searchParams.get("error_description"),
        has_code: !!code,
        has_state: !!state,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(not set)",
        VERCEL_URL: process.env.VERCEL_URL ?? "(not set)",
        VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "(not set)",
      })
    );
  }
  return nextAuthHandler(req, ctx as any);
}

async function POST(req: NextRequest, ctx: { params: { nextauth: string[] } }) {
  return nextAuthHandler(req, ctx as any);
}

export { GET, POST };
