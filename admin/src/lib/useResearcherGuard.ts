"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isStudyScoped } from "./roles";

/**
 * Client-side guard for pages every researcher may open but a
 * `study-researcher` may not — shared configuration such as cue pools and the
 * questionnaire library, which other studies use too (#66).
 *
 * Redirects a study-scoped account to /access-denied. The backend refuses
 * these routes for that role regardless; this only spares them a page of
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
