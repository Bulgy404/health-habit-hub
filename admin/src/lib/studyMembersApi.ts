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

export const MEMBERS_PAGE_SIZE = 25;

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
  /** Total across every page, so the UI can say "12 of 240" honestly. */
  total: number;
  limit: number;
  skip: number;
  members: StudyMember[];
}

export interface MemberInput {
  userId: string;
  username?: string;
  role: MemberRole;
  scope: MemberScope;
}

/** One study a given researcher can reach — the per-person view of the same data. */
export interface UserMembership extends StudyMember {
  studyId: string;
  studyName: string | null;
}

export interface UserMembershipsResponse {
  userId: string;
  total: number;
  limit: number;
  skip: number;
  memberships: UserMembership[];
}

export interface TeamUser {
  id: string;
  username: string;
  email: string | null;
}

export function listStudyMembers(
  token: string,
  studyId: string,
  paging: { limit?: number; skip?: number } = {},
): Promise<StudyMembersResponse> {
  const params = new URLSearchParams({
    limit: String(paging.limit ?? MEMBERS_PAGE_SIZE),
    skip: String(paging.skip ?? 0),
  });
  return apiFetch(
    apiUrl(`/admin/studies/${studyId}/members?${params}`),
    token,
  );
}

/**
 * Grants access to one or more people at once.
 *
 * The server refuses the whole batch if any id belongs to no account, so a
 * partial application cannot happen — half-applied access changes are worse
 * than none, because the admin sees an error with no way to know which half
 * went through.
 */
export function addStudyMembers(
  token: string,
  studyId: string,
  members: MemberInput[],
): Promise<{ ok: boolean; granted: number }> {
  return apiFetch(apiUrl(`/admin/studies/${studyId}/members`), token, {
    method: "POST",
    body: JSON.stringify({ members }),
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

/**
 * Every study one researcher can reach.
 *
 * "What can this person see?" is an audit question that gets asked under the
 * joint-controllership arrangement, and answering it by opening each study in
 * turn does not survive more than a handful of studies.
 */
export function listMembershipsForUser(
  token: string,
  userId: string,
): Promise<UserMembershipsResponse> {
  return apiFetch(
    apiUrl(`/admin/study-memberships?userId=${encodeURIComponent(userId)}`),
    token,
  );
}

/**
 * Finds a real account to grant access to. Shared with the Team & Roles page —
 * picking from here is what keeps a mistyped `sub` from becoming a grant that
 * looks live and gates nothing.
 */
export function searchTeamUsers(
  token: string,
  query: string,
): Promise<{ users: TeamUser[] }> {
  return apiFetch(
    apiUrl(`/admin/team/search?q=${encodeURIComponent(query)}`),
    token,
  );
}
