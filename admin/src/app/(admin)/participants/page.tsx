"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl, API_BASE_URL } from "@/lib/api";
import styles from "@/components/admin-page.module.css";

const GROUPS = ["G1", "G2", "G3", "G4"] as const;
const TOKEN_FORMATS = ["qr", "print", "both"] as const;

interface Participant {
  id: string;
  username: string;
  group: string;
  createdAt: string | null;
  lastActiveAt: string | null;
  surveysCompleted: number | null;
  surveysTotal: number | null;
  recoveryPhrase: string | null;
  hasTokenCard: boolean;
}

interface CreatedParticipant {
  userId?: string;
  username?: string;
  password?: string;
}

interface QuestionnaireWindow {
  questionnaireSlug: string;
  occurrence: number;
  scheduledFor: string | null;
  submittedAt: string | null;
  responseId: string | null;
}

interface QuestionnaireResponse {
  responseId: string;
  questionnaireSlug: string;
  answers: Record<string, unknown>;
  submittedAt: string | null;
}

interface ParticipantHabit {
  id: string;
  habitName: string;
  category: string;
  isHabit: boolean;
  studyId: string | null;
  donatedAt: string | null;
}

interface Progress {
  profile: { completed: boolean; completedAt: string | null };
  surveys: { id: string; title: string; completedAt: string | null }[];
  habitsCount: number;
  recommendations: { accepted: number; dismissed: number };
  questionnaires: QuestionnaireWindow[];
  timeline: { type: string; timestamp: string | null; detail: string }[];
}

function normalise(raw: unknown): Participant {
  const j = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(j.userId ?? j._id ?? ""),
    username: String(j.username ?? ""),
    group: String(j.group ?? ""),
    createdAt: (j.createdAt ?? j.enrolledAt) ? String(j.createdAt ?? j.enrolledAt) : null,
    lastActiveAt: (j.lastActiveAt ?? j.lastActive) ? String(j.lastActiveAt ?? j.lastActive) : null,
    surveysCompleted: typeof j.surveysCompleted === "number" ? j.surveysCompleted : null,
    surveysTotal: typeof j.surveysTotal === "number" ? j.surveysTotal : null,
    recoveryPhrase: j.recoveryPhrase ? String(j.recoveryPhrase) : null,
    hasTokenCard: Boolean(j.hasTokenCard),
  };
}

function fmt(ts: string | null, withTime = false): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

/**
 * Participant management: list, create (with token card), reassign group,
 * anonymise, download token card, and inspect per-participant progress.
 * Moved here from the mobile admin section.
 */
export default function ParticipantsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations("participants");
  const tc = useTranslations("common");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState<(typeof GROUPS)[number]>("G1");
  const [newFormat, setNewFormat] = useState<(typeof TOKEN_FORMATS)[number]>("both");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedParticipant | null>(null);

  // Progress modal
  const [progressFor, setProgressFor] = useState<Participant | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  // Dev test tools (fast-forward) — gated by ENABLE_TEST_TOOLS on the backend
  const [testTools, setTestTools] = useState(false);
  const [ffDays, setFfDays] = useState(30);
  const [ffBusy, setFfBusy] = useState(false);
  const [ffMsg, setFfMsg] = useState<string | null>(null);

  // Recovery-phrase modal
  const [phraseFor, setPhraseFor] = useState<Participant | null>(null);
  const [phraseCopied, setPhraseCopied] = useState(false);

  // Questionnaire responses (answers) for the open progress participant
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([]);
  const [habits, setHabits] = useState<ParticipantHabit[]>([]);
  const [answersFor, setAnswersFor] = useState<{
    slug: string;
    occurrence: number;
    answers: Record<string, unknown>;
    submittedAt: string | null;
  } | null>(null);

  const token = session?.accessToken;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(apiUrl("/admin/participants"), token);
      setParticipants((Array.isArray(data) ? data : []).map(normalise));
      setError(null);
      apiFetch(apiUrl("/admin/participants/test-tools"), token)
        .then((r) => setTestTools(Boolean(r?.enabled)))
        .catch(() => setTestTools(false));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
      return;
    }
    load();
  }, [session, status, router, load]);

  async function handleCreate() {
    if (!token) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl("/admin/participants"), token, {
        method: "POST",
        body: JSON.stringify({ group: newGroup, tokenCardFormat: newFormat }),
      });
      setCreated({ userId: res?.userId, username: res?.username, password: res?.password });
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleGroupChange(id: string, group: string) {
    if (!token) return;
    try {
      await apiFetch(apiUrl(`/admin/participants/${id}/group`), token, {
        method: "PATCH",
        body: JSON.stringify({ group }),
      });
      setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, group } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("groupUpdateFailed"));
    }
  }

  async function handleDelete(p: Participant) {
    if (!token || !confirm(t("confirmAnonymise", { username: p.username }))) return;
    try {
      await apiFetch(apiUrl(`/admin/participants/${p.id}`), token, { method: "DELETE" });
      setParticipants((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
    }
  }

  async function openTokenCard(id: string) {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/participants/${id}/token-card?format=both`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Token card failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke a little later so the new tab has time to load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tokenCardFailed"));
    }
  }

  function openAnswers(q: QuestionnaireWindow) {
    const resp = q.responseId
      ? responses.find((r) => r.responseId === q.responseId)
      : responses.find((r) => r.questionnaireSlug === q.questionnaireSlug);
    setAnswersFor({
      slug: q.questionnaireSlug,
      occurrence: q.occurrence,
      answers: resp?.answers ?? {},
      submittedAt: q.submittedAt,
    });
  }

  async function handleFastForward() {
    if (!token || !progressFor) return;
    setFfBusy(true);
    setFfMsg(null);
    try {
      const res = await apiFetch(
        apiUrl(`/admin/participants/${progressFor.id}/fast-forward`),
        token,
        { method: "POST", body: JSON.stringify({ days: ffDays }) }
      );
      setFfMsg(t("ffShiftedBack", { days: res?.days ?? ffDays }));
      await openProgress(progressFor);
      setFfMsg(t("ffAdvanced", { days: res?.days ?? ffDays }));
    } catch (e) {
      setFfMsg(e instanceof Error ? e.message : t("fastForwardFailed"));
    } finally {
      setFfBusy(false);
    }
  }

  async function openProgress(p: Participant) {
    if (!token) return;
    setProgressFor(p);
    setProgress(null);
    setResponses([]);
    setHabits([]);
    setFfMsg(null);
    setProgressLoading(true);
    try {
      const [data, respData, habitData] = await Promise.all([
        apiFetch(apiUrl(`/admin/participants/${p.id}/progress`), token),
        apiFetch(apiUrl(`/admin/participants/${p.id}/responses`), token).catch(() => ({
          responses: [],
        })),
        apiFetch(apiUrl(`/admin/participants/${p.id}/habits`), token).catch(() => ({ habits: [] })),
      ]);
      setHabits(
        ((habitData?.habits ?? []) as Record<string, unknown>[]).map((h) => ({
          id: String(h.id ?? ""),
          habitName: String(h.habitName ?? ""),
          category: String(h.category ?? "Other"),
          isHabit: h.isHabit !== false,
          studyId: h.studyId ? String(h.studyId) : null,
          donatedAt: h.donatedAt ? String(h.donatedAt) : null,
        }))
      );
      setResponses(
        ((respData?.responses ?? []) as Record<string, unknown>[]).map((r) => ({
          responseId: String(r.responseId ?? ""),
          questionnaireSlug: String(r.questionnaireSlug ?? ""),
          answers: (r.answers ?? {}) as Record<string, unknown>,
          submittedAt: r.submittedAt ? String(r.submittedAt) : null,
        }))
      );
      setProgress({
        profile: {
          completed: Boolean(data?.profile?.completed),
          completedAt: data?.profile?.completedAt ?? null,
        },
        surveys: (data?.surveys ?? []).map((s: Record<string, unknown>) => ({
          id: String(s.id ?? ""),
          title: String(s.title ?? ""),
          completedAt: s.completedAt ? String(s.completedAt) : null,
        })),
        habitsCount: Number(data?.habitsCount ?? 0),
        recommendations: {
          accepted: Number(data?.recommendations?.accepted ?? 0),
          dismissed: Number(data?.recommendations?.dismissed ?? 0),
        },
        questionnaires: (data?.questionnaires ?? []).map((q: Record<string, unknown>) => ({
          questionnaireSlug: String(q.questionnaireSlug ?? ""),
          occurrence: Number(q.occurrence ?? 0),
          scheduledFor: q.scheduledFor ? String(q.scheduledFor) : null,
          submittedAt: q.submittedAt ? String(q.submittedAt) : null,
          responseId: q.responseId ? String(q.responseId) : null,
        })),
        timeline: (data?.timeline ?? []).map((tl: Record<string, unknown>) => ({
          type: String(tl.type ?? ""),
          timestamp: tl.timestamp ? String(tl.timestamp) : null,
          detail: String(tl.detail ?? ""),
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("progressLoadFailed"));
      setProgressFor(null);
    } finally {
      setProgressLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <button
          className={styles.addButton}
          onClick={() => {
            setCreated(null);
            setShowCreate(true);
          }}
        >
          {t("newParticipant")}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p>{tc("loading")}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("userId")}</th>
                <th>{t("username")}</th>
                <th>{t("group")}</th>
                <th>{t("enrolled")}</th>
                <th>{t("lastActive")}</th>
                <th>{t("surveys")}</th>
                <th>{tc("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={styles.code} title={t("keycloakSubTooltip")}>
                      {p.id}
                    </span>
                  </td>
                  <td>
                    <span className={styles.code}>{p.username || "—"}</span>
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={GROUPS.includes(p.group as (typeof GROUPS)[number]) ? p.group : ""}
                      onChange={(e) => handleGroupChange(p.id, e.target.value)}
                    >
                      {!GROUPS.includes(p.group as (typeof GROUPS)[number]) && (
                        <option value="">{p.group || "—"}</option>
                      )}
                      {GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{fmt(p.createdAt)}</td>
                  <td>{fmt(p.lastActiveAt, true)}</td>
                  <td>
                    {p.surveysCompleted != null && p.surveysTotal != null
                      ? `${p.surveysCompleted}/${p.surveysTotal}`
                      : "—"}
                  </td>
                  <td>
                    <button
                      className={`${styles.actionBtn} ${styles.primaryBtn}`}
                      onClick={() => openProgress(p)}
                    >
                      {t("progress")}
                    </button>
                    {p.recoveryPhrase && (
                      <button className={styles.actionBtn} onClick={() => setPhraseFor(p)}>
                        {t("recoveryPhrase")}
                      </button>
                    )}
                    {p.hasTokenCard && (
                      <button className={styles.actionBtn} onClick={() => openTokenCard(p.id)}>
                        {t("tokenCard")}
                      </button>
                    )}
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => handleDelete(p)}
                    >
                      {tc("delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {participants.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: "center", padding: "2rem" }}
                    className={styles.muted}
                  >
                    {t("noParticipants")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create modal ─────────────────────────────────────────── */}
      {showCreate && (
        <div className={styles.modalOverlay} onClick={() => setShowCreate(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{t("newParticipantTitle")}</h2>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t("group")}</label>
              <select
                className={styles.select}
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value as (typeof GROUPS)[number])}
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t("tokenCard")}</label>
              <select
                className={styles.select}
                value={newFormat}
                onChange={(e) => setNewFormat(e.target.value as (typeof TOKEN_FORMATS)[number])}
              >
                {TOKEN_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelButton} onClick={() => setShowCreate(false)}>
                {tc("cancel")}
              </button>
              <button className={styles.saveButton} onClick={handleCreate} disabled={creating}>
                {creating ? t("creatingEllipsis") : tc("add")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Created credentials ──────────────────────────────────── */}
      {created && (
        <div className={styles.modalOverlay} onClick={() => setCreated(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{t("participantCreated")}</h2>
            <p className={styles.subtitle}>{t("saveCredentialsNow")}</p>
            <div className={styles.credBox} style={{ marginTop: "1rem" }}>
              <div className={styles.credRow}>
                <span className={styles.muted}>{t("userId")}</span>
                <span className={styles.code}>{created.userId ?? "—"}</span>
              </div>
              <div className={styles.credRow}>
                <span className={styles.muted}>{t("username")}</span>
                <span className={styles.code}>{created.username ?? "—"}</span>
              </div>
              <div className={styles.credRow}>
                <span className={styles.muted}>{t("password")}</span>
                <span className={styles.code}>{created.password ?? "—"}</span>
              </div>
            </div>
            <div className={styles.formActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => created.userId && openTokenCard(created.userId)}
              >
                {t("openTokenCard")}
              </button>
              <button className={styles.saveButton} onClick={() => setCreated(null)}>
                {t("done")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Answers modal ───────────────────────────────────────── */}
      {/* Opened from inside the Progress modal, so it must stack above it.
          Both share .modalOverlay (z-index 50) and this one renders first in
          the DOM, so bump it above the Progress overlay explicitly. */}
      {answersFor && (
        <div
          className={styles.modalOverlay}
          style={{ zIndex: 60 }}
          onClick={() => setAnswersFor(null)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {t("answersTitle", { slug: answersFor.slug, occurrence: answersFor.occurrence })}
            </h2>
            <p className={styles.subtitle}>
              {t("submittedLabel", {
                date: answersFor.submittedAt ? fmt(answersFor.submittedAt) : "—",
              })}
            </p>
            {Object.keys(answersFor.answers).length === 0 ? (
              <p className={styles.muted} style={{ marginTop: "1rem" }}>
                {t("noAnswerContent")}
              </p>
            ) : (
              <div className={styles.credBox} style={{ marginTop: "1rem" }}>
                {Object.entries(answersFor.answers).map(([q, a]) => (
                  <div key={q} className={styles.credRow}>
                    <span className={styles.muted}>{q}</span>
                    <span className={styles.code}>
                      {typeof a === "object" ? JSON.stringify(a) : String(a)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.saveButton} onClick={() => setAnswersFor(null)}>
                {tc("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recovery phrase modal ───────────────────────────────── */}
      {phraseFor && phraseFor.recoveryPhrase && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setPhraseFor(null);
            setPhraseCopied(false);
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{t("recoveryPhrase")}</h2>
            <p className={styles.subtitle}>{t("recoveryPhraseDesc")}</p>
            <div className={styles.credBox} style={{ margin: "0.75rem 0" }}>
              <div className={styles.credRow}>
                <span className={styles.muted}>{t("userId")}</span>
                <span className={styles.code}>{phraseFor.id}</span>
              </div>
            </div>
            <ol
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.4rem 1rem",
                margin: "1rem 0",
                paddingLeft: "1.5rem",
              }}
            >
              {phraseFor.recoveryPhrase.split(/\s+/).map((w, i) => (
                <li key={i} className={styles.code}>
                  {w}
                </li>
              ))}
            </ol>
            <div className={styles.formActions}>
              <button
                className={styles.secondaryButton}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(phraseFor.recoveryPhrase ?? "");
                    setPhraseCopied(true);
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
              >
                {phraseCopied ? t("copiedCheck") : t("copy")}
              </button>
              <button
                className={styles.saveButton}
                onClick={() => {
                  setPhraseFor(null);
                  setPhraseCopied(false);
                }}
              >
                {tc("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Progress modal ───────────────────────────────────────── */}
      {progressFor && (
        <div className={styles.modalOverlay} onClick={() => setProgressFor(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {t("progressTitle", { name: progressFor.username || progressFor.id })}
            </h2>
            {progressLoading || !progress ? (
              <p>{tc("loading")}</p>
            ) : (
              <>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>{t("profile")}</div>
                  <div>
                    {progress.profile.completed
                      ? t("completedOn", { date: fmt(progress.profile.completedAt) })
                      : t("notCompleted")}
                  </div>
                </div>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>{t("habitsAndRecommendations")}</div>
                  <div>
                    {t("habitsSummary", {
                      count: progress.habitsCount,
                      accepted: progress.recommendations.accepted,
                      dismissed: progress.recommendations.dismissed,
                    })}
                  </div>
                </div>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>{t("createdHabits")}</div>
                  {habits.length === 0 ? (
                    <div className={styles.muted}>{t("noHabitsCreated")}</div>
                  ) : (
                    habits.map((h) => (
                      <div key={h.id} className={styles.credRow}>
                        <span>
                          {h.habitName || "—"}
                          {h.category && h.category !== "Other" && (
                            <span className={styles.badge} style={{ marginLeft: 8 }}>
                              {h.category}
                            </span>
                          )}
                          {!h.isHabit && (
                            <span className={styles.muted} style={{ marginLeft: 8 }}>
                              {t("notAHabit")}
                            </span>
                          )}
                        </span>
                        <span className={styles.muted}>{h.donatedAt ? fmt(h.donatedAt) : "—"}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>{t("surveys")}</div>
                  {progress.surveys.length === 0 ? (
                    <div className={styles.muted}>{tc("none")}</div>
                  ) : (
                    progress.surveys.map((s) => (
                      <div key={s.id} className={styles.credRow}>
                        <span>{s.title || s.id}</span>
                        <span className={styles.muted}>
                          {s.completedAt ? fmt(s.completedAt) : t("pending")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>{t("questionnaires")}</div>
                  {progress.questionnaires.length === 0 ? (
                    <div className={styles.muted}>{t("noneScheduled")}</div>
                  ) : (
                    progress.questionnaires.map((q, i) => (
                      <div key={i} className={styles.credRow}>
                        <span>
                          <span className={styles.code}>{q.questionnaireSlug}</span> · #
                          {q.occurrence}{" "}
                          <span className={styles.muted}>
                            {t("dueLabel", { date: fmt(q.scheduledFor) })}
                          </span>
                        </span>
                        <span>
                          {q.submittedAt ? (
                            <>
                              <span className={styles.muted}>
                                {t("doneOn", { date: fmt(q.submittedAt) })}
                              </span>{" "}
                              <button className={styles.actionBtn} onClick={() => openAnswers(q)}>
                                {t("viewAnswers")}
                              </button>
                            </>
                          ) : (
                            <span className={styles.muted}>{t("pending")}</span>
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>{t("timeline")}</div>
                  {progress.timeline.length === 0 ? (
                    <div className={styles.muted}>{t("noActivityRecorded")}</div>
                  ) : (
                    progress.timeline.map((tl, i) => (
                      <div key={i} className={styles.credRow}>
                        <span>
                          {tl.type}
                          {tl.detail ? ` — ${tl.detail}` : ""}
                        </span>
                        <span className={styles.muted}>{fmt(tl.timestamp, true)}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
            {testTools && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>{t("testingFastForward")}</div>
                <div className={styles.muted} style={{ marginBottom: 8 }}>
                  {t("fastForwardDesc")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label className={styles.muted} htmlFor="ffDays">
                    {t("advanceBy")}
                  </label>
                  <input
                    id="ffDays"
                    type="number"
                    min={1}
                    max={365}
                    value={ffDays}
                    onChange={(e) =>
                      setFfDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))
                    }
                    style={{ width: 72 }}
                  />
                  <span className={styles.muted}>{t("daysLabel")}</span>
                  <button
                    className={styles.actionBtn}
                    onClick={handleFastForward}
                    disabled={ffBusy}
                  >
                    {ffBusy ? t("workingEllipsis") : t("fastForward")}
                  </button>
                  {ffMsg && <span className={styles.muted}>{ffMsg}</span>}
                </div>
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.saveButton} onClick={() => setProgressFor(null)}>
                {tc("close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
