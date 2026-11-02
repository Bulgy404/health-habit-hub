"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isStudyScoped } from "./roles";

/**
 * Client-side guard for shared configuration pages, such as cue pools and
 * the questionnaire editor, which researchers cannot change across studies.
 *
 * Redirects a study-scoped account to /access-denied. The backend refuses
 * these routes for both research roles regardless; this only spares them a page of
 * errors.
 */
export function useResearcherGuard(): void {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (isStudyScoped(session?.roles)) {
      router.replace("/access-denied");
    }
  }, [session, status, router]);
}
