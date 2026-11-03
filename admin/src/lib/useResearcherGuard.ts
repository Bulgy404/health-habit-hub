"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isStudyScoped } from "./roles";

/** Portal access for study-owned questionnaire and cue editors. Server routes
 * enforce resource ownership and study management permission. */
export function useResearcherGuard(): void {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin") && !isStudyScoped(session?.roles)) {
      router.replace("/access-denied");
    }
  }, [session, status, router]);
}
