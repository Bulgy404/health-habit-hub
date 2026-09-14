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
export const IDENTITY_BASE_URL = process.env.NEXT_PUBLIC_IDENTITY_API_URL ?? "/identity/api";

export function identityUrl(path: string): string {
  return `${IDENTITY_BASE_URL}${path}`;
}

/* ── Registers ────────────────────────────────────────────────────────────── */

export interface RegisterState {
  exists: boolean;
  subjectCodePrefix?: string;
  /**
   * Display-only label, shown on printed code sheets and in invitations.
   * The register stores it rather than the caller sending it per request:
   * what a participant is told they enrolled in must not depend on whatever
   * the client happened to pass that time.
   */
  studyName?: string | null;
  /**
   * Whether the caller holds an assignment row on this register. A realm role
   * says *what*; an assignment says *where*. Someone with the right role and no
   * assignment sees an empty roster, which looks identical to an empty study —
   * this is what lets the page say which it is.
   */
  assigned?: boolean;
  roles?: string[];
}

export function getRegister(token: string, studyId: string): Promise<RegisterState> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/register`), token);
}

/**
 * The prefix a register mints subject codes with. Frozen at creation — every
 * code already issued embeds it — so the UI validates before submitting rather
 * than surfacing a bare 400.
 */
export const SUBJECT_CODE_PREFIX_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,31}$/;

export function createRegister(
  token: string,
  studyId: string,
  subjectCodePrefix: string,
  studyName?: string
): Promise<{ id: string; subjectCodePrefix: string; studyName: string | null }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/register`), token, {
    method: "POST",
    body: JSON.stringify({ subjectCodePrefix, studyName }),
  });
}

/**
 * The registers this account may actually work in.
 *
 * The portal previously asked for a 24-character hexadecimal study id typed
 * from memory, because the study LIST lives behind `/admin/studies`, which
 * needs `admin` or `researcher` — and a study nurse is neither. So the role
 * that uses this screen daily was the one that could not discover what to
 * type.
 */
export interface RegisterSummary {
  hhhStudyId: string;
  subjectCodePrefix: string;
  studyName: string | null;
  status: string;
  roles: string[];
}

export function listMyRegisters(token: string): Promise<{ registers: RegisterSummary[] }> {
  return apiFetch(identityUrl("/v1/registers"), token);
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
  query = ""
): Promise<{ subjects: Subject[] }> {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  return apiFetch(identityUrl(`/v1/studies/${studyId}/subjects${q}`), token);
}

export function createSubject(
  token: string,
  studyId: string,
  person: Record<string, string>
): Promise<{ id: string; subjectCode: string }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/subjects`), token, {
    method: "POST",
    body: JSON.stringify(person),
  });
}

export function issueCode(
  token: string,
  subjectId: string
): Promise<{
  code: string;
  codeId: string;
  subjectCode: string;
  expiresAt: string;
}> {
  return apiFetch(identityUrl(`/v1/subjects/${subjectId}/codes`), token, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Import a roster CSV.
 *
 * Raw `fetch`, not `apiFetch`: that helper forces `Content-Type:
 * application/json`, which breaks `FormData` — the browser must set its own
 * multipart boundary.
 *
 * The report it returns is keyed by row number and subject code and never
 * echoes the submitted data back. Callers must not re-display the uploaded
 * file to "helpfully" show what failed: that would put the names back on a
 * screen the report format was designed to keep them off.
 */
export async function importRoster(
  token: string,
  studyId: string,
  file: File
): Promise<ImportReport> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(identityUrl(`/v1/studies/${studyId}/subjects/import`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Import failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Email one issued code to the address held for that subject.
 *
 * The address is never sent by the caller and never returned — the service
 * decrypts it, uses it and discards it. The response says only whether the
 * message went, deliberately not to where.
 */
export function sendCodeByEmail(
  token: string,
  subjectId: string,
  codeId: string
): Promise<{ sent: boolean; reason: string | null }> {
  return apiFetch(identityUrl(`/v1/subjects/${subjectId}/codes/${codeId}/send`), token, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Art. 17 erasure. Deletes the register row outright, taking the account link
 * and any issued codes with it; only an audit entry naming the subject code
 * survives. Re-identification is severed permanently, while the pseudonymous
 * research data in HHH is retained and stays analysable.
 *
 * That asymmetry is deliberate, is stated in the participant consent, and
 * cannot be undone.
 */
export function eraseSubject(
  token: string,
  subjectId: string
): Promise<{ erased: boolean; subjectCode: string }> {
  return apiFetch(identityUrl(`/v1/subjects/${subjectId}`), token, {
    method: "DELETE",
  });
}

export function markVerified(
  token: string,
  subjectId: string,
  method: "in_person" | "email" | "sms"
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
export async function downloadCodeSheet(token: string, studyId: string): Promise<Blob> {
  // The study's name is read from the register, not passed here: a handout
  // given to a patient should not say whatever the caller sent, and it used
  // to say the literal word "Study".
  const res = await fetch(identityUrl(`/v1/studies/${studyId}/codes/sheet.pdf`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
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
  studyId: string
): Promise<{ assignments: Assignment[] }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/assignments`), token);
}

export function createAssignment(
  token: string,
  studyId: string,
  body: { actorSub: string; role: Assignment["role"]; siteId?: string | null }
): Promise<{ ok: boolean }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/assignments`), token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAssignment(
  token: string,
  studyId: string,
  body: {
    actorSub: string;
    role: Assignment["role"];
    siteId?: string | null;
  }
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
  studyId: string
): Promise<{ requests: ReidRequest[] }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/reidentification-requests`), token);
}

export function createReidRequest(
  token: string,
  studyId: string,
  body: {
    subjectCode: string;
    legalBasis: LegalBasis;
    reason: string;
    fieldsRequested: string[];
  }
): Promise<{ id: string; status: string }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/reidentification-requests`), token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function decideReidRequest(
  token: string,
  requestId: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<{ status: string }> {
  return apiFetch(identityUrl(`/v1/reidentification-requests/${requestId}/decide`), token, {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  });
}

/**
 * Withdraw an approval before its window expires.
 *
 * The remedy for an approval granted on a mistaken premise. Without it the
 * only option is waiting out the TTL, which is the wrong answer under exactly
 * the time pressure that produces a mistaken approval.
 */
export function revokeReidRequest(token: string, requestId: string): Promise<{ status: string }> {
  return apiFetch(identityUrl(`/v1/reidentification-requests/${requestId}/revoke`), token, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * The only call that returns plaintext identity.
 *
 * `cache: "no-store"` matters here beyond politeness — a cached reveal would
 * outlive the time-limited grant that authorised it.
 */
export async function revealRequest(
  token: string,
  requestId: string
): Promise<{
  subjectCode: string;
  fields: Record<string, string | null>;
  revealCount: number;
  expiresAt: string;
}> {
  const res = await fetch(identityUrl(`/v1/reidentification-requests/${requestId}/reveal`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
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
  limit = 200
): Promise<{ entries: AuditEntry[] }> {
  return apiFetch(identityUrl(`/v1/studies/${studyId}/audit?limit=${limit}`), token);
}
