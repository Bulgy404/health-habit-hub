import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // NEXTAUTH_URL is the public base and already includes the app's base path
  // (e.g. https://host/admin). req.url's origin reflects this self-hosted
  // Next.js server's own bind address (e.g. http://0.0.0.0:3001) — using it
  // would bake a broken absolute URL into redirects. Also, req.nextUrl.pathname
  // has the basePath stripped, so we re-attach it via publicBase. Building an
  // absolute-path URL relative to req.url would drop the basePath entirely.
  const publicBase = (process.env.NEXTAUTH_URL ?? req.nextUrl.origin).replace(/\/+$/, "");

  if (!token) {
    const signInUrl = new URL(`${publicBase}/api/auth/signin`);
    const callbackUrl = new URL(`${publicBase}${req.nextUrl.pathname}${req.nextUrl.search}`);
    signInUrl.searchParams.set("callbackUrl", callbackUrl.toString());
    return NextResponse.redirect(signInUrl);
  }

  const roles: string[] = token.roles ?? [];
  if (!roles.includes("admin") && !roles.includes("researcher")) {
    return NextResponse.redirect(new URL(`${publicBase}/access-denied`));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|access-denied|_next/static|_next/image|favicon.ico).*)"],
};
