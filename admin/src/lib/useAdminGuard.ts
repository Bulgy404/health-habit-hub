"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Client-side guard for admin-only pages.
 *
 * Unauthenticated requests are already redirected to sign-in by the Next.js
 * middleware; this hook additionally redirects authenticated non-admin users
 * (e.g. researchers) to /access-denied and exposes the session access token
 * for API calls.
 *
 * @returns The access token (empty string while the session is loading).
 */
export function useAdminGuard(): { token: string } {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
    }
  }, [session, status, router]);

  return { token };
}
