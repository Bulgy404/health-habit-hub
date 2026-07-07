"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Insights has been merged into the combined Analytics dashboard (as a tab).
 * This route now redirects there so existing bookmarks keep working.
 */
export default function InsightsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/analytics");
  }, [router]);
  return null;
}
