import { apiFetch } from "./api";

/**
 * Client for the identity register.
 *
 * The portal talks to the register **directly**, not through the HHH backend.
 * Proxying would route participant names through `app/`'s pino logging, its
 * Sentry hook and `auditAdminActions` — which writes `res.locals.auditDetail`
 * into Mongo on any 4xx. A validation error on a roster import would then
 * write a patient's email into the research database, permanently, in an
 * append-only collection.
 *
 * Both services sit behind the same host with different path prefixes, so this
 * is same-origin and needs no CORS today.
 */
export const IDENTITY_BASE_URL =
  process.env.NEXT_PUBLIC_IDENTITY_API_URL ?? "/identity/api";

export function identityUrl(path: string): string {
  return `${IDENTITY_BASE_URL}${path}`;
}

export interface Subject {
  id: string;
  subjectCode: string;
  siteId: string | null;
  status: "registered" | "code_issued" | "enrolled" | "withdrawn" | "excluded";
  verifiedAt: string | null;
  /** Present only for roles permitted to read PII. */
  givenName?: string | null;
  familyName?: string | null;
  dateOfBirth?: string | null;
  email?: string | null;
}

export interface ImportRow {
  row: number;
  subjectCode?: string;
  duplicateOf?: string | null;
  error?: string;
}

export interface ImportReport {
  imported: number;
  failed: number;
  rows: ImportRow[];
}

export function listSubjects(
  token: string,
  studyId: string,
  query = "",
): Promise<{ subjects: Subject[] }> {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  return apiFetch(identityUrl(`/v1/studies/${studyId}/subjects${q}`), token);
}

export function createSubject(
  token: string,
  studyId: string,
  person: Record<string, string>,
): Promise<{ id: string; subjectCode: string }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/subjects`), token, {
    method: "POST",
    body: JSON.stringify(person),
  });
}

export function issueCode(
  token: string,
  subjectId: string,
): Promise<{ code: string; subjectCode: string; expiresAt: string }> {
  return apiFetch(identityUrl(`/v1/subjects/${subjectId}/codes`), token, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function markVerified(
  token: string,
  subjectId: string,
  method: "in_person" | "email" | "sms",
): Promise<{ ok: boolean }> {
  return apiFetch(identityUrl(`/v1/subjects/${subjectId}/verify`), token, {
    method: "POST",
    body: JSON.stringify({ method }),
  });
}

/**
 * The code sheet is a binary download and must never be cached — it is a
 * roster of patients. Fetched directly rather than through `apiFetch`, which
 * always parses JSON.
 */
export async function downloadCodeSheet(
  token: string,
  studyId: string,
  studyName: string,
): Promise<Blob> {
  const res = await fetch(
    identityUrl(
      `/v1/studies/${studyId}/codes/sheet.pdf?studyName=${encodeURIComponent(studyName)}`,
    ),
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Code sheet failed: ${res.status}`);
  return res.blob();
}
