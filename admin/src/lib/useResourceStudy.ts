"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch, apiUrl } from "./api";
export function useResourceStudy(token: string) {
  const { data: session } = useSession();
  const isAdmin = session?.roles?.includes("admin") ?? false;
  const [studies, setStudies] = useState<{ id: string; name: string; canManage?: boolean }[]>([]);
  const [studyId, setStudyId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const all = [];
        for (let page = 1; ; page++) {
          const data = await apiFetch(apiUrl(`/admin/studies?page=${page}&limit=100`), token);
          const batch = Array.isArray(data) ? data : (data.studies ?? []);
          all.push(...batch);
          if (Array.isArray(data) || all.length >= (data.total ?? all.length) || !batch.length)
            break;
        }
        if (active) setStudies(all);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load studies");
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);
  return {
    studies,
    studyId,
    setStudyId,
    error,
    isAdmin,
    canManage: isAdmin || !!studies.find((s) => s.id === studyId)?.canManage,
    query: studyId ? `?studyId=${encodeURIComponent(studyId)}` : "",
  };
}
