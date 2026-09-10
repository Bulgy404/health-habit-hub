/**
 * Study consent documents — the additional consent a participant accepts when
 * joining a verified study.
 *
 * A document exists per (slug, language). Each language resolves from one of
 * two sources: a file shipped with the app, or a row edited here that
 * overrides it. `source` says which is live, because "I edited it and nothing
 * changed" is the confusion that precedence creates when it is hidden.
 */

import { apiFetch, apiUrl, fetchWithRefresh } from "./api";

/**
 * A save rejected by validation. Carries the individual problems, which
 * `apiFetch` would otherwise flatten into a single opaque message — the whole
 * point of the editor's error area is saying *which* rule failed.
 */
export class ConsentDocumentValidationError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(problems.join(", "));
    this.name = "ConsentDocumentValidationError";
    this.problems = problems;
  }
}

export type DocumentSource = "db" | "file" | "missing";
export type DocumentStatus = "draft" | "published";

export interface ConsentLanguageState {
  lang: string;
  source: DocumentSource;
  version: string | null;
  effectiveDate: string | null;
  bindingLanguage: string | null;
  status: DocumentStatus | null;
  hasPlaceholders: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ConsentDocumentSummary {
  slug: string;
  ready: boolean;
  /**
   * Machine-readable reasons a document is not ready, e.g.
   * `missing_languages:ja,nl`. Rendered by splitting on the first colon —
   * the prefix picks the message, the suffix fills its placeholder.
   */
  reasons: string[];
  languages: ConsentLanguageState[];
  studies: { id: string; name: string | null; mode: string }[];
}

export interface EditableConsentDocument {
  slug: string;
  lang: string;
  source: DocumentSource;
  body: string;
  version: string;
  effectiveDate: string;
  bindingLanguage: string;
  status: DocumentStatus;
  updatedAt: string | null;
  updatedBy: string | null;
  fileAvailable: boolean;
  fileBody: string | null;
  hasPlaceholders: boolean;
}

export async function listConsentDocuments(
  token: string | null,
): Promise<{ languages: string[]; documents: ConsentDocumentSummary[] }> {
  return apiFetch(apiUrl("/admin/consent-documents"), token ?? "");
}

export async function getConsentDocument(
  token: string | null,
  slug: string,
  lang: string,
): Promise<EditableConsentDocument> {
  return apiFetch(apiUrl(`/admin/consent-documents/${slug}/${lang}`), token ?? "");
}

export async function saveConsentDocument(
  token: string | null,
  slug: string,
  lang: string,
  doc: {
    body: string;
    version: string;
    effectiveDate: string;
    bindingLanguage: string;
    status: DocumentStatus;
  },
): Promise<{ ready: boolean; reasons: string[] }> {
  const res = await fetchWithRefresh(
    apiUrl(`/admin/consent-documents/${slug}/${lang}`),
    token ?? "",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      problems?: string[];
    };
    if (body.problems?.length) {
      throw new ConsentDocumentValidationError(body.problems);
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Drops the override for one language so the shipped file becomes live again.
 * A revert, not a deletion — the wording matters in the UI.
 */
export async function revertConsentDocument(
  token: string | null,
  slug: string,
  lang: string,
): Promise<{ removed: boolean; document: EditableConsentDocument }> {
  return apiFetch(apiUrl(`/admin/consent-documents/${slug}/${lang}`), token ?? "", {
    method: "DELETE",
  });
}

/** Matches the slug pattern the backend enforces, so the UI fails early. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
