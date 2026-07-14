import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const signInUrl = new URL("/api/auth/signin", req.url);
    // req.url's origin reflects this self-hosted Next.js server's own bind
    // address (e.g. http://0.0.0.0:3001) rather than the public-facing host
    // seen by the browser — using it here would bake a broken absolute URL
    // into callbackUrl, which NextAuth later redirects to post-login. The
    // path/query are still correct from req.url; only the origin needs to
    // come from the known-correct configured URL instead.
    const publicOrigin = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
    const callbackUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, publicOrigin);
    signInUrl.searchParams.set("callbackUrl", callbackUrl.toString());
    return NextResponse.redirect(signInUrl);
  }

  const roles: string[] = token.roles ?? [];
  if (!roles.includes("admin") && !roles.includes("researcher")) {
    return NextResponse.redirect(new URL("/access-denied", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|access-denied|_next/static|_next/image|favicon.ico).*)"],
};
