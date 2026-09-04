"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export const IDENTITY_ROLES = [
  "identity-manager",
  "study-nurse",
  "monitor",
] as const;

export type IdentityRole = (typeof IDENTITY_ROLES)[number];

/**
 * Client-side guard for identity-register pages.
 *
 * Deliberately NOT `useAdminGuard`: an `admin` has no standing access to the
 * register, and a `study-nurse` is not an admin. Access here follows the
 * identity roles only.
 *
 * The mirror of the server's rule is enforced here too — an account holding
 * `researcher` alongside an identity role is refused, so the UI never offers a
 * door the API will slam. The API remains the authority; this only avoids a
 * confusing 403 after a page has already rendered.
 */
export function useIdentityGuard(): {
  token: string;
  roles: IdentityRole[];
  canReadPii: boolean;
  canApprove: boolean;
  loading: boolean;
} {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";
  const all: string[] = session?.roles ?? [];
  const roles = IDENTITY_ROLES.filter((r) => all.includes(r));
  const conflicted = all.includes("researcher") && roles.length > 0;

  useEffect(() => {
    if (status === "loading") return;
    if (conflicted || roles.length === 0) {
      router.replace("/access-denied");
    }
  }, [status, conflicted, roles.length, router]);

  return {
    token,
    roles,
    // A monitor sees subject codes and status; only these two see names.
    canReadPii:
      roles.includes("identity-manager") || roles.includes("study-nurse"),
    canApprove: roles.includes("monitor"),
    loading: status === "loading",
  };
}
