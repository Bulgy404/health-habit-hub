import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // NEXTAUTH_URL is the full path to the NextAuth API and, for a basePath app,
  // must include it — e.g. https://host/admin/api/auth (required so NextAuth
  // generates correct sign-in/callback/CSRF links). The app's public base for
  // redirects/callbackUrl is that value minus the trailing /api/auth.
  // req.url's origin reflects this self-hosted Next.js server's own bind address
  // (e.g. http://0.0.0.0:3001), not the public host, so we rely on NEXTAUTH_URL;
  // req.nextUrl.pathname has the basePath stripped, so we re-attach it via appBase.
  const authBase = (process.env.NEXTAUTH_URL ?? `${req.nextUrl.origin}/api/auth`).replace(/\/+$/, "");
  const appBase = authBase.replace(/\/api\/auth$/, "");

  if (!token) {
    const signInUrl = new URL(`${authBase}/signin`);
    const callbackUrl = new URL(`${appBase}${req.nextUrl.pathname}${req.nextUrl.search}`);
    signInUrl.searchParams.set("callbackUrl", callbackUrl.toString());
    return NextResponse.redirect(signInUrl);
  }

  const roles: string[] = token.roles ?? [];
  // Identity roles are included so study nurses and monitors can load the
  // portal shell at all. Without this they cannot reach /identity even with
  // the correct realm role — per-page guards then decide what each may see.
  const PORTAL_ROLES = [
    "admin",
    "researcher",
    "identity-manager",
    "study-nurse",
    "monitor",
  ];
  if (!PORTAL_ROLES.some((r) => roles.includes(r))) {
    return NextResponse.redirect(new URL(`${appBase}/access-denied`));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|access-denied|_next/static|_next/image|favicon.ico).*)"],
};
