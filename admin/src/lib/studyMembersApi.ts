/**
 * Per-study researcher membership.
 *
 * On a **verified** study the `researcher` realm role is not sufficient — a
 * researcher must be named here. `scope` separates reading a study from
 * exporting it, because downloading a bundle is materially more than viewing
 * a page. Admins always pass, and anonymous studies are unaffected.
 */

import { apiFetch, apiUrl } from "./api";

export type MemberRole = "researcher" | "lead";
export type MemberScope = "read" | "export";

export interface StudyMember {
  id: string;
  userId: string;
  username: string | null;
  role: MemberRole;
  scope: MemberScope;
  createdAt: string;
  createdBy: string | null;
}

export interface StudyMembersResponse {
  /**
   * Whether membership actually gates access for this study today. False on an
   * anonymous study — members can still be listed and added, they simply have
   * no effect until the study becomes verified. Surfacing this stops "I added
   * someone and nothing happened" from looking like a bug.
   */
  enforced: boolean;
  members: StudyMember[];
}

export function listStudyMembers(
  token: string,
  studyId: string,
): Promise<StudyMembersResponse> {
  return apiFetch(apiUrl(`/admin/studies/${studyId}/members`), token);
}

export function addStudyMember(
  token: string,
  studyId: string,
  member: {
    userId: string;
    username?: string;
    role: MemberRole;
    scope: MemberScope;
  },
): Promise<{ ok: boolean }> {
  return apiFetch(apiUrl(`/admin/studies/${studyId}/members`), token, {
    method: "POST",
    body: JSON.stringify(member),
  });
}

export function removeStudyMember(
  token: string,
  studyId: string,
  userId: string,
): Promise<{ removed: boolean }> {
  return apiFetch(
    apiUrl(`/admin/studies/${studyId}/members/${encodeURIComponent(userId)}`),
    token,
    { method: "DELETE" },
  );
}
