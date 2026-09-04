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

/* ── Site assignments ─────────────────────────────────────────────────────── */

export interface Assignment {
  actorSub: string;
  role: "identity-manager" | "study-nurse" | "monitor";
  siteId: string | null;
}

export function listAssignments(
  token: string,
  studyId: string,
): Promise<{ assignments: Assignment[] }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/assignments`), token);
}

export function createAssignment(
  token: string,
  studyId: string,
  body: { actorSub: string; role: Assignment["role"]; siteId?: string | null },
): Promise<{ ok: boolean }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/assignments`), token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAssignment(
  token: string,
  studyId: string,
  body: { actorSub: string; role: Assignment["role"] },
): Promise<{ ok: boolean }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/assignments`), token, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

/* ── Re-identification ────────────────────────────────────────────────────── */

export const LEGAL_BASES = [
  "sae",
  "safety_report",
  "regulatory_inspection",
  "participant_request",
  "data_correction",
  "other",
] as const;

export type LegalBasis = (typeof LEGAL_BASES)[number];

export interface ReidRequest {
  id: string;
  subject_code: string | null;
  request_type: string;
  legal_basis: LegalBasis;
  reason: string;
  fields_requested: string[];
  status: "pending" | "approved" | "rejected" | "expired" | "revoked";
  requested_by: string;
  requested_at: string;
  reveal_expires_at: string | null;
  reveal_count: number;
}

export function listReidRequests(
  token: string,
  studyId: string,
): Promise<{ requests: ReidRequest[] }> {
  return apiFetch(
    identityUrl(`/v1/studies/${studyId}/reidentification-requests`),
    token,
  );
}

export function createReidRequest(
  token: string,
  studyId: string,
  body: {
    subjectCode: string;
    legalBasis: LegalBasis;
    reason: string;
    fieldsRequested: string[];
  },
): Promise<{ id: string; status: string }> {
  return apiFetch(
    identityUrl(`/v1/studies/${studyId}/reidentification-requests`),
    token,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function decideReidRequest(
  token: string,
  requestId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<{ status: string }> {
  return apiFetch(
    identityUrl(`/v1/reidentification-requests/${requestId}/decide`),
    token,
    { method: "POST", body: JSON.stringify({ decision, note }) },
  );
}

/**
 * The only call that returns plaintext identity.
 *
 * `cache: "no-store"` matters here beyond politeness — a cached reveal would
 * outlive the time-limited grant that authorised it.
 */
export async function revealRequest(
  token: string,
  requestId: string,
): Promise<{
  subjectCode: string;
  fields: Record<string, string | null>;
  revealCount: number;
  expiresAt: string;
}> {
  const res = await fetch(
    identityUrl(`/v1/reidentification-requests/${requestId}/reveal`),
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `Reveal failed: ${res.status}`);
  }
  return res.json();
}

/* ── Audit ────────────────────────────────────────────────────────────────── */

export interface AuditEntry {
  id: number;
  actor_sub: string;
  actor_roles: string[];
  action: string;
  sensitivity: "list" | "write" | "pii_read" | "reveal" | "export";
  subject_code: string | null;
  fields: string[] | null;
  status_code: number | null;
  repeat_count: number;
  created_at: string;
}

export function listAudit(
  token: string,
  studyId: string,
  limit = 200,
): Promise<{ entries: AuditEntry[] }> {
  return apiFetch(
    identityUrl(`/v1/studies/${studyId}/audit?limit=${limit}`),
    token,
  );
}
