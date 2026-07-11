"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import styles from "./page.module.css";

import { useStudiesData } from "./useStudiesData";
import { apiFetch, apiUrl } from "@/lib/api";
import { useActivityTypes } from "@/lib/useActivityTypes";
import { CueConfigForm } from "@/components/cue-config-form";
import { ActivityTypesManager } from "@/components/activity-types-manager";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudyGroup {
  id: string;
  label: string;
  index: number;
  allocationWeight?: number;
  cueConfig?: CueConfig | null;
  // null = inherit the study-level flag; boolean overrides per group.
  onboardingEnabled?: boolean | null;
  selfHabitCreationEnabled?: boolean | null;
}

interface CueConfig {
  cueCount: "single" | "multi";
  cueSource: "low_quality" | "high_quality" | "self_selected";
  cuePoolId: string | null;
  /** Empty = free-text habit entry; non-empty = structured catalog picks. */
  behaviorOptions: string[];
  maxHabits: number | null;
}

interface StudySummary {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  recommenderEnabled: boolean;
  onboardingEnabled: boolean;
  selfHabitCreationEnabled: boolean;
  questionnaireReminders?: { enabled: boolean; hour: number };
  endDate?: string | null;
  endOfStudyNotification?: { enabled: boolean; title: string; body: string };
  groups: StudyGroup[];
  questionnaires: string[];
  participantCount: number;
  createdAt: string | null;
}

/** Per-language text, e.g. `{ en: 'Hello', de: 'Hallo' }`, as returned by the questionnaires API. */
type LocaleText = Partial<Record<"en" | "de" | "fr" | "ja" | "nl", string>>;

interface QuestionnaireSummary {
  id: string;
  slug: string;
  title: LocaleText;
  description: LocaleText;
  isLibrary: boolean;
  active: boolean;
}

interface StudyCode {
  code: string;
  groupId: string | null; // null = study-level code, group assigned at redemption
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  createdAt: string | null;
}

interface ScheduledNotification {
  id: string;
  studyId: string;
  targetIds: string[];
  targetType: string;
  title: string;
  body: string;
  scheduledFor: string;
  status: string;
}

interface SentNotification {
  id: string;
  title: string;
  body: string;
  targetType: string;
  targetIds: string[];
  sentAt: string | null;
  recipientCount: number | null;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolves a locale-text map to a single display string, preferring English. */
function previewText(map: LocaleText | undefined): string {
  if (!map) return "";
  return map.en || Object.values(map).find(Boolean) || "";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = apiUrl("/admin/studies");
const QUESTIONNAIRES_API = apiUrl("/admin/questionnaires");
const NOTIFICATIONS_BASE = apiUrl("/admin/notifications");

// ── Questionnaires tab ────────────────────────────────────────────────────────

function QuestionnairesTab({
  study,
  token,
  onSaved,
}: {
  study: StudySummary;
  token: string;
  onSaved: () => void;
}) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const [allQuestionnaires, setAllQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(study.questionnaires ?? []));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    apiFetch(QUESTIONNAIRES_API, token)
      .then((data) => {
        if (!cancelled) {
          setAllQuestionnaires(Array.isArray(data) ? (data as QuestionnaireSummary[]) : []);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof Error ? err.message : t("questionnairesTab.errors.loadFailed")
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  function toggleId(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      await apiFetch(`${API_BASE}/${study.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ questionnaires: Array.from(selected) }),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("saveFailedGeneric"));
    } finally {
      setSaving(false);
    }
  }

  const library = allQuestionnaires.filter((q) => q.isLibrary);
  const custom = allQuestionnaires.filter((q) => !q.isLibrary);

  return (
    <div className={styles.questionnairesTab}>
      {loadError && <div className={styles.errorMsg}>{loadError}</div>}
      {loading ? (
        <div className={styles.loadingState}>{tc("loading")}</div>
      ) : allQuestionnaires.length === 0 ? (
        <div className={styles.emptyState}>{t("questionnairesTab.empty")}</div>
      ) : (
        <>
          {library.length > 0 && (
            <div className={styles.qSection}>
              <p className={styles.qSectionTitle}>{t("questionnairesTab.libraryTitle")}</p>
              <div className={styles.qList}>
                {library.map((q) => (
                  <label key={q.id} className={styles.qItem}>
                    <input
                      type="checkbox"
                      className={styles.qCheckbox}
                      checked={selected.has(q.id)}
                      onChange={() => toggleId(q.id)}
                    />
                    <span className={styles.qTitle}>{previewText(q.title)}</span>
                    {!q.active && (
                      <span className={styles.qInactive}>
                        {t("questionnairesTab.inactiveBadge")}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
          {custom.length > 0 && (
            <div className={styles.qSection}>
              <p className={styles.qSectionTitle}>{t("questionnairesTab.customTitle")}</p>
              <div className={styles.qList}>
                {custom.map((q) => (
                  <label key={q.id} className={styles.qItem}>
                    <input
                      type="checkbox"
                      className={styles.qCheckbox}
                      checked={selected.has(q.id)}
                      onChange={() => toggleId(q.id)}
                    />
                    <span className={styles.qTitle}>{previewText(q.title)}</span>
                    {!q.active && (
                      <span className={styles.qInactive}>
                        {t("questionnairesTab.inactiveBadge")}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
          {saveError && <div className={styles.errorMsg}>{saveError}</div>}
          <div className={styles.qFooter}>
            {saved && <span className={styles.savedMsg}>{t("saved")}</span>}
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? tc("saving") : tc("save")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Questionnaire schedule tab ─────────────────────────────────────────────────

interface Cadence {
  mode: "interval" | "fixed";
  startOffsetDays?: number;
  intervalDays?: number;
  occurrences?: number;
  weeks?: number[];
  days?: number[];
}

interface ScheduleAssignment {
  id: string;
  groupId: string | null;
  questionnaireId: string;
  questionnaireSlug: string;
  questionnaireTitle: string;
  cadence: Cadence;
  cadenceSummary: string;
  active: boolean;
  occurrences: number;
}

interface Completion {
  questionnaireId: string | null;
  questionnaireSlug: string;
  total: number;
  completed: number;
}

interface CalendarEntry {
  date: string; // YYYY-MM-DD
  items: {
    questionnaireSlug: string;
    total: number;
    completed: number;
    projected?: boolean;
  }[];
}

/**
 * Assign questionnaires to a study (all groups) or to a specific group, on a
 * recurring-interval or fixed-week cadence, and view completion across
 * participants. Scheduled "windows" are generated per participant; completion
 * is tracked as they submit responses.
 */
function QuestionnaireScheduleTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [completion, setCompletion] = useState<Completion[]>([]);
  const [calendar, setCalendar] = useState<CalendarEntry[]>([]);
  const [allQ, setAllQ] = useState<QuestionnaireSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Add-assignment form
  const [qId, setQId] = useState("");
  const [scope, setScope] = useState("study"); // "study" or a group id
  const [mode, setMode] = useState<"interval" | "fixed">("interval");
  const [startOffsetDays, setStartOffsetDays] = useState(0);
  const [intervalDays, setIntervalDays] = useState(7);
  const [occurrences, setOccurrences] = useState(8);
  const [weeksStr, setWeeksStr] = useState("0, 4, 8");
  const [daysStr, setDaysStr] = useState("");
  const addFormRef = useRef<HTMLDivElement | null>(null);

  const base = `${API_BASE}/${study.id}/questionnaire-assignments`;

  // Clicking a calendar day pre-fills the "Add assignment" form with an
  // interval cadence starting on that day (relative to today, since windows
  // are always scheduled relative to a participant's enrollment date).
  function handleDayClick(dateStr: string) {
    const clicked = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.max(
      0,
      Math.round((clicked.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    );
    setMode("interval");
    setStartOffsetDays(diffDays);
    addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, qs, cal] = await Promise.all([
        apiFetch(base, token),
        apiFetch(QUESTIONNAIRES_API, token),
        apiFetch(`${API_BASE}/${study.id}/questionnaire-calendar`, token).catch(() => ({
          calendar: [],
        })),
      ]);
      setAssignments((data.assignments ?? []) as ScheduleAssignment[]);
      setCompletion((data.completion ?? []) as Completion[]);
      setCalendar((cal?.calendar ?? []) as CalendarEntry[]);
      setAllQ(Array.isArray(qs) ? (qs as QuestionnaireSummary[]) : []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scheduleTab.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [base, token, t]);

  useEffect(() => {
    load();
  }, [load]);

  function scopeLabel(groupId: string | null): string {
    if (!groupId) return t("scheduleTab.studyWide");
    const g = study.groups.find((gr) => gr.id === groupId);
    return g ? g.label || t("groupFallbackLabel", { index: g.index }) : t("unknownGroupFallback");
  }

  function completionFor(slug: string): string {
    const c = completion.find((x) => x.questionnaireSlug === slug);
    return t("scheduleTab.completionFraction", {
      completed: c?.completed ?? 0,
      total: c?.total ?? 0,
    });
  }

  async function handleAdd() {
    if (!qId) {
      setError(t("scheduleTab.errors.chooseQuestionnaire"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const parseList = (s: string) =>
        s
          .split(",")
          .map((x) => parseInt(x.trim(), 10))
          .filter((n) => !Number.isNaN(n));
      let cadence: Cadence;
      if (mode === "interval") {
        cadence = { mode, startOffsetDays, intervalDays, occurrences };
      } else {
        const weeks = parseList(weeksStr);
        const days = parseList(daysStr);
        cadence = { mode: "fixed" };
        if (weeks.length) cadence.weeks = weeks;
        if (days.length) cadence.days = days;
      }
      await apiFetch(base, token, {
        method: "POST",
        body: JSON.stringify({
          questionnaireId: qId,
          groupId: scope === "study" ? null : scope,
          cadence,
        }),
      });
      setQId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scheduleTab.errors.addFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("scheduleTab.confirmRemove"))) return;
    try {
      await apiFetch(`${base}/${id}`, token, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scheduleTab.errors.deleteFailed"));
    }
  }

  if (loading) return <div className={styles.loadingState}>{tc("loading")}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {error && <div className={styles.errorMsg}>{error}</div>}

      {/* Current assignments */}
      <div>
        <p className={styles.qSectionTitle}>{t("scheduleTab.assignedTitle")}</p>
        {assignments.length === 0 ? (
          <p className={styles.hint}>{t("scheduleTab.noneAssigned")}</p>
        ) : (
          <table className={styles.table} style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={cellHead}>{t("scheduleTab.questionnaireHeader")}</th>
                <th style={cellHead}>{t("scheduleTab.scopeHeader")}</th>
                <th style={cellHead}>{t("scheduleTab.cadenceHeader")}</th>
                <th style={cellHead}>{t("scheduleTab.completedHeader")}</th>
                <th style={cellHead}></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td style={cell}>{a.questionnaireTitle}</td>
                  <td style={cell}>{scopeLabel(a.groupId)}</td>
                  <td style={cell}>
                    {a.cadenceSummary} <span className={styles.hint}>({a.occurrences}×)</span>
                  </td>
                  <td style={cell}>{completionFor(a.questionnaireSlug)}</td>
                  <td style={cell}>
                    <button
                      className={styles.saveBtn}
                      style={{ background: "transparent", color: "#dc2626" }}
                      onClick={() => handleDelete(a.id)}
                    >
                      {t("scheduleTab.remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add assignment */}
      <div className={styles.cueConfigGroup} ref={addFormRef}>
        <p className={styles.cueConfigGroupLabel}>{t("scheduleTab.addTitle")}</p>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("scheduleTab.questionnaireHeader")}</label>
            <select className={styles.select} value={qId} onChange={(e) => setQId(e.target.value)}>
              <option value="">{t("scheduleTab.selectPlaceholder")}</option>
              {allQ.map((q) => (
                <option key={q.id} value={q.id}>
                  {previewText(q.title)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("scheduleTab.appliesToLabel")}</label>
            <select
              className={styles.select}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="study">{t("scheduleTab.wholeStudyOption")}</option>
              {study.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {t("scheduleTab.groupOnlyOption", {
                    label: g.label || t("groupFallbackLabel", { index: g.index }),
                  })}
                </option>
              ))}
            </select>
            <span className={styles.hint}>{t("scheduleTab.appliesToHint")}</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("scheduleTab.cadenceHeader")}</label>
            <select
              className={styles.select}
              value={mode}
              onChange={(e) => setMode(e.target.value as "interval" | "fixed")}
            >
              <option value="interval">{t("scheduleTab.intervalOption")}</option>
              <option value="fixed">{t("scheduleTab.fixedOption")}</option>
            </select>
          </div>
        </div>

        {mode === "interval" ? (
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("scheduleTab.firstDueLabel")}</label>
              <input
                className={styles.select}
                type="number"
                min={0}
                value={startOffsetDays}
                onChange={(e) => setStartOffsetDays(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("scheduleTab.everyDaysLabel")}</label>
              <input
                className={styles.select}
                type="number"
                min={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("scheduleTab.occurrencesLabel")}</label>
              <input
                className={styles.select}
                type="number"
                min={1}
                value={occurrences}
                onChange={(e) => setOccurrences(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>
        ) : (
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("scheduleTab.weeksLabel")}</label>
              <input
                className={styles.select}
                value={weeksStr}
                onChange={(e) => setWeeksStr(e.target.value)}
                placeholder={t("scheduleTab.weeksPlaceholder")}
              />
              <span className={styles.hint}>{t("scheduleTab.weeksHint")}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("scheduleTab.daysLabel")}</label>
              <input
                className={styles.select}
                value={daysStr}
                onChange={(e) => setDaysStr(e.target.value)}
                placeholder={t("scheduleTab.daysPlaceholder")}
              />
              <span className={styles.hint}>{t("scheduleTab.daysHint")}</span>
            </div>
          </div>
        )}

        <div className={styles.cueConfigFooter}>
          <button className={styles.saveBtn} onClick={handleAdd} disabled={saving}>
            {saving ? t("addingEllipsis") : t("scheduleTab.addAssignment")}
          </button>
        </div>
      </div>

      {/* Calendar of scheduled questionnaire due dates */}
      <div>
        <p className={styles.qSectionTitle}>{t("scheduleTab.calendarTitle")}</p>
        <p className={styles.hint} style={{ marginTop: "-0.25rem", marginBottom: "0.5rem" }}>
          {t("scheduleTab.calendarHint")}
        </p>
        <ScheduleCalendar
          entries={calendar}
          endDate={study.endDate ?? null}
          onDayClick={handleDayClick}
        />
      </div>
    </div>
  );
}

/** Month-grid calendar highlighting days with scheduled questionnaires. */
function ScheduleCalendar({
  entries,
  endDate,
  onDayClick,
}: {
  entries: CalendarEntry[];
  endDate?: string | null;
  onDayClick?: (dateStr: string) => void;
}) {
  const t = useTranslations("studies");
  const byDate = new Map(entries.map((e) => [e.date, e.items]));
  // Start the view on the month of the earliest scheduled date, else today.
  const firstDate = entries
    .map((e) => e.date)
    .sort()
    .find(Boolean);
  const initial = firstDate ? new Date(`${firstDate}T00:00:00`) : new Date();
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const year = view.getFullYear();
  const month = view.getMonth();
  const monthLabel = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const endDateStr = endDate ? endDate.slice(0, 10) : null;

  function goToToday() {
    const todayDate = new Date();
    setView(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
        }}
      >
        <button
          className={styles.saveBtn}
          style={{ background: "transparent", color: "var(--color-text)" }}
          onClick={() => setView(new Date(year, month - 1, 1))}
        >
          ‹
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <strong>{monthLabel}</strong>
          <button
            className={styles.saveBtn}
            style={{ background: "transparent", color: "var(--color-primary)", padding: "2px 8px" }}
            onClick={goToToday}
          >
            {t("scheduleTab.calendar.today")}
          </button>
        </div>
        <button
          className={styles.saveBtn}
          style={{ background: "transparent", color: "var(--color-text)" }}
          onClick={() => setView(new Date(year, month + 1, 1))}
        >
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {[
          t("scheduleTab.calendar.weekdayMon"),
          t("scheduleTab.calendar.weekdayTue"),
          t("scheduleTab.calendar.weekdayWed"),
          t("scheduleTab.calendar.weekdayThu"),
          t("scheduleTab.calendar.weekdayFri"),
          t("scheduleTab.calendar.weekdaySat"),
          t("scheduleTab.calendar.weekdaySun"),
        ].map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: "0.7rem",
              color: "var(--color-text-muted)",
              fontWeight: 600,
            }}
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
          const items = byDate.get(dateStr);
          const isToday = dateStr === todayStr;
          const isEndDate = endDateStr !== null && dateStr === endDateStr;
          const isPastEnd = endDateStr !== null && dateStr > endDateStr;
          const isPast = dateStr < todayStr;
          const clickable = !!onDayClick && !isPastEnd;
          const allProjected = !!items && items.every((it) => it.projected);
          const label = items
            ? items
                .map(
                  (it) =>
                    t("scheduleTab.calendar.dayTooltipItem", {
                      slug: it.questionnaireSlug,
                      completed: it.completed,
                      total: it.total,
                    }) + (it.projected ? t("scheduleTab.calendar.previewSuffix") : "")
                )
                .join("\n")
            : undefined;
          return (
            <div
              key={i}
              title={label}
              onClick={clickable ? () => onDayClick?.(dateStr) : undefined}
              style={{
                minHeight: 46,
                border: isEndDate ? "1px solid #dc2626" : "1px solid var(--color-border)",
                borderStyle: allProjected ? "dashed" : "solid",
                borderRadius: 6,
                padding: "2px 4px",
                background: isPastEnd
                  ? "var(--color-surface-muted, #f3f4f6)"
                  : items
                    ? "#eef2ff"
                    : "transparent",
                outline: isToday ? "2px solid var(--color-primary)" : "none",
                opacity: isPastEnd ? 0.5 : 1,
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  color: isEndDate ? "#dc2626" : "var(--color-text-muted)",
                  fontWeight: isEndDate ? 700 : 400,
                }}
              >
                {day}
                {isEndDate && " ⏹"}
              </div>
              {items && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
                  {items.slice(0, 2).map((it) => (
                    <span
                      key={it.questionnaireSlug}
                      style={{
                        fontSize: "0.6rem",
                        color: it.projected ? "#6b7280" : "#4338ca",
                        fontStyle: it.projected ? "italic" : "normal",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.questionnaireSlug} · {it.total}
                    </span>
                  ))}
                  {items.length > 2 && (
                    <span style={{ fontSize: "0.6rem", color: "#4338ca" }}>
                      +{items.length - 2}
                    </span>
                  )}
                </div>
              )}
              {!items && !isPast && !isPastEnd && onDayClick && (
                <div style={{ fontSize: "0.6rem", color: "var(--color-text-muted)" }}>+</div>
              )}
            </div>
          );
        })}
      </div>
      {entries.length === 0 && (
        <p className={styles.hint} style={{ marginTop: "0.5rem" }}>
          {t("scheduleTab.calendar.noOccurrences")}
        </p>
      )}
    </div>
  );
}

const cellHead: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--color-text-muted)",
  borderBottom: "1px solid var(--color-border)",
};
const cell: CSSProperties = {
  padding: "0.6rem 0.75rem",
  borderBottom: "1px solid var(--color-border)",
  fontSize: "0.9rem",
};

// ── Codes tab ─────────────────────────────────────────────────────────────────

function CodesTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  // ── Codes list ───────────────────────────────────────────────────────────
  const [codes, setCodes] = useState<StudyCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [codesError, setCodesError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  // ── Allocation weights (slider) ──────────────────────────────────────────
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(study.groups.map((g) => [g.id, g.allocationWeight ?? 1]))
  );
  const [savingAlloc, setSavingAlloc] = useState(false);
  const [allocSaved, setAllocSaved] = useState(false);
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;

  // ── Study-level code generation (primary) ────────────────────────────────
  const [studyCount, setStudyCount] = useState(10);
  const [studyMaxRed, setStudyMaxRed] = useState("");
  const [studyExpiry, setStudyExpiry] = useState("");
  const [studyGenerating, setStudyGenerating] = useState(false);
  const [studyGenError, setStudyGenError] = useState("");
  const [studyGenCodes, setStudyGenCodes] = useState<string[]>([]);
  const [studyCopied, setStudyCopied] = useState(false);

  // ── Targeted group codes (secondary, collapsible) ────────────────────────
  const [targetOpen, setTargetOpen] = useState(false);
  const [genGroupId, setGenGroupId] = useState(study.groups[0]?.id ?? "");
  const [genCount, setGenCount] = useState(1);
  const [genMaxRed, setGenMaxRed] = useState("");
  const [genExpiry, setGenExpiry] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const fetchCodes = useCallback(
    async (p: number) => {
      setLoadingCodes(true);
      setCodesError("");
      try {
        const data = await apiFetch(
          `${API_BASE}/${study.id}/codes?page=${p}&limit=${limit}`,
          token
        );
        setCodes((data as { codes: StudyCode[] }).codes ?? []);
        setTotal((data as { total: number }).total ?? 0);
      } catch (err) {
        setCodesError(err instanceof Error ? err.message : t("codesTab.errors.loadFailed"));
      } finally {
        setLoadingCodes(false);
      }
    },
    [study.id, token, t]
  );

  useEffect(() => {
    fetchCodes(page);
  }, [fetchCodes, page]);

  function groupLabel(groupId: string | null): string {
    if (!groupId) return t("codesTab.autoAssigned");
    const g = study.groups.find((grp) => grp.id === groupId);
    return g ? g.label || t("groupFallbackLabel", { index: g.index }) : groupId;
  }

  // ── Allocation save ──────────────────────────────────────────────────────
  async function handleSaveAllocation() {
    setSavingAlloc(true);
    try {
      await apiFetch(`${API_BASE}/${study.id}/allocation`, token, {
        method: "PATCH",
        body: JSON.stringify({
          weights: study.groups.map((g) => ({
            groupId: g.id,
            weight: weights[g.id] ?? 1,
          })),
        }),
      });
      setAllocSaved(true);
      setTimeout(() => setAllocSaved(false), 2000);
    } catch {
      // ignore — allocation save is best-effort in the UI
    } finally {
      setSavingAlloc(false);
    }
  }

  // ── Study-level code generation ──────────────────────────────────────────
  async function handleStudyGenerate() {
    setStudyGenerating(true);
    setStudyGenError("");
    setStudyGenCodes([]);
    try {
      const payload: Record<string, unknown> = { count: studyCount };
      if (studyMaxRed) payload.maxRedemptions = parseInt(studyMaxRed, 10);
      if (studyExpiry) payload.expiresAt = studyExpiry;
      const data = await apiFetch(`${API_BASE}/${study.id}/codes`, token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const newCodes: string[] = ((data as { codes: StudyCode[] }).codes ?? []).map((c) =>
        typeof c === "string" ? c : c.code
      );
      setStudyGenCodes(newCodes);
      setPage(1);
      await fetchCodes(1);
    } catch (err) {
      setStudyGenError(err instanceof Error ? err.message : t("codesTab.errors.generateFailed"));
    } finally {
      setStudyGenerating(false);
    }
  }

  async function handleStudyCopyAll() {
    await navigator.clipboard.writeText(studyGenCodes.join("\n"));
    setStudyCopied(true);
    setTimeout(() => setStudyCopied(false), 2000);
  }

  // ── Targeted group code generation ───────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setGenError("");
    setGeneratedCodes([]);
    try {
      const payload: Record<string, unknown> = { groupId: genGroupId, count: genCount };
      if (genMaxRed) payload.maxRedemptions = parseInt(genMaxRed, 10);
      if (genExpiry) payload.expiresAt = genExpiry;
      const data = await apiFetch(`${API_BASE}/${study.id}/codes`, token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const newCodes: string[] = ((data as { codes: StudyCode[] }).codes ?? []).map((c) =>
        typeof c === "string" ? c : c.code
      );
      setGeneratedCodes(newCodes);
      setPage(1);
      await fetchCodes(1);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : t("codesTab.errors.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyAll() {
    await navigator.clipboard.writeText(generatedCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke(code: string) {
    setRevoking(code);
    try {
      await apiFetch(`${API_BASE}/${study.id}/codes/${code}`, token, { method: "DELETE" });
      await fetchCodes(page);
    } catch {
      // ignore
    } finally {
      setRevoking(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.codesTab}>
      {/* ── Allocation sliders ──────────────────────────────────────────── */}
      <div className={styles.genSection}>
        <h3 className={styles.genTitle}>{t("codesTab.allocationTitle")}</h3>
        <p className={styles.genDesc}>{t("codesTab.allocationDesc")}</p>
        <div className={styles.allocGrid}>
          {study.groups.map((g) => {
            const w = weights[g.id] ?? 1;
            const pct = Math.round((w / totalWeight) * 100);
            return (
              <div key={g.id} className={styles.allocRow}>
                <span className={styles.allocLabel}>
                  {g.label || t("groupFallbackLabel", { index: g.index })}
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={w}
                  className={styles.allocSlider}
                  onChange={(e) =>
                    setWeights((prev) => ({ ...prev, [g.id]: Number(e.target.value) }))
                  }
                />
                <span className={styles.allocPct}>{pct}%</span>
              </div>
            );
          })}
        </div>
        <div className={styles.allocActions}>
          <button
            className={styles.allocEqualBtn}
            onClick={() => setWeights(Object.fromEntries(study.groups.map((g) => [g.id, 1])))}
          >
            {t("codesTab.equalButton")}
          </button>
          <button className={styles.saveBtn} onClick={handleSaveAllocation} disabled={savingAlloc}>
            {allocSaved
              ? t("codesTab.savedAllocation")
              : savingAlloc
                ? tc("saving")
                : t("codesTab.saveAllocation")}
          </button>
        </div>
      </div>

      {/* ── Study-level code generation (primary) ──────────────────────── */}
      <div className={styles.genSection}>
        <h3 className={styles.genTitle}>{t("codesTab.generateTitle")}</h3>
        <p className={styles.genDesc}>{t("codesTab.generateDesc")}</p>
        <div className={styles.genForm}>
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("codesTab.quantityLabel")}</label>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={100}
              value={studyCount}
              onChange={(e) => setStudyCount(Math.min(100, Math.max(1, Number(e.target.value))))}
            />
            <span className={styles.hint}>{t("codesTab.quantityHintStudy")}</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("codesTab.maxRedemptionsLabel")}</label>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={studyMaxRed}
              onChange={(e) => setStudyMaxRed(e.target.value)}
              placeholder={t("codesTab.unlimitedPlaceholder")}
            />
            <span className={styles.hint}>{t("codesTab.maxRedemptionsHint")}</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("codesTab.expiryLabel")}</label>
            <input
              className={styles.input}
              type="datetime-local"
              value={studyExpiry}
              onChange={(e) => setStudyExpiry(e.target.value)}
            />
            <span className={styles.hint}>{t("codesTab.expiryHint")}</span>
          </div>
        </div>
        {studyGenError && <div className={styles.errorMsg}>{studyGenError}</div>}
        <button className={styles.saveBtn} onClick={handleStudyGenerate} disabled={studyGenerating}>
          {studyGenerating ? t("generatingEllipsis") : t("codesTab.generateCodes")}
        </button>
        {studyGenCodes.length > 0 && (
          <div className={styles.genResult}>
            <div className={styles.genResultHeader}>
              <span className={styles.genResultTitle}>
                {t("codesTab.codesGeneratedCount", { count: studyGenCodes.length })}
              </span>
              <button className={styles.copyAllBtn} onClick={handleStudyCopyAll}>
                {studyCopied ? t("copiedExclaim") : t("copyAll")}
              </button>
            </div>
            <div className={styles.codeList}>
              {studyGenCodes.map((c) => (
                <span key={c} className={styles.codeChip}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Targeted group codes (secondary, collapsible) ───────────────── */}
      <div className={styles.genSection}>
        <button className={styles.targetedToggle} onClick={() => setTargetOpen((o) => !o)}>
          {targetOpen ? "▾" : "▸"} {t("codesTab.targetedToggle")}
          <span className={styles.targetedToggleSub}>{t("codesTab.targetedToggleSub")}</span>
        </button>
        {targetOpen && (
          <>
            <div className={styles.genForm} style={{ marginTop: "0.75rem" }}>
              <div className={styles.formGroup}>
                <label className={styles.label}>{t("groupHeader")}</label>
                <select
                  className={styles.select}
                  value={genGroupId}
                  onChange={(e) => setGenGroupId(e.target.value)}
                >
                  {study.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label || t("groupFallbackLabel", { index: g.index })}
                    </option>
                  ))}
                </select>
                <span className={styles.hint}>{t("codesTab.groupHint")}</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>{t("codesTab.quantityLabel")}</label>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={100}
                  value={genCount}
                  onChange={(e) => setGenCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                />
                <span className={styles.hint}>{t("codesTab.targetedQuantityHint")}</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>{t("codesTab.maxRedemptionsLabel")}</label>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={genMaxRed}
                  onChange={(e) => setGenMaxRed(e.target.value)}
                  placeholder={t("codesTab.unlimitedPlaceholder")}
                />
                <span className={styles.hint}>{t("codesTab.maxRedemptionsHint")}</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>{t("codesTab.expiryLabel")}</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={genExpiry}
                  onChange={(e) => setGenExpiry(e.target.value)}
                />
                <span className={styles.hint}>{t("codesTab.expiryHint")}</span>
              </div>
            </div>
            {genError && <div className={styles.errorMsg}>{genError}</div>}
            <button className={styles.saveBtn} onClick={handleGenerate} disabled={generating}>
              {generating ? t("generatingEllipsis") : t("codesTab.generateTargeted")}
            </button>
            {generatedCodes.length > 0 && (
              <div className={styles.genResult}>
                <div className={styles.genResultHeader}>
                  <span className={styles.genResultTitle}>
                    {t("codesTab.codesGeneratedCount", { count: generatedCodes.length })}
                  </span>
                  <button className={styles.copyAllBtn} onClick={handleCopyAll}>
                    {copied ? t("copiedExclaim") : t("copyAll")}
                  </button>
                </div>
                <div className={styles.codeList}>
                  {generatedCodes.map((c) => (
                    <span key={c} className={styles.codeChip}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Codes table ─────────────────────────────────────────────────── */}
      <div className={styles.codesTableSection}>
        <h3 className={styles.genTitle}>{t("codesTab.existingCodesTitle")}</h3>
        {codesError && <div className={styles.errorMsg}>{codesError}</div>}
        {loadingCodes ? (
          <div className={styles.loadingState}>{tc("loading")}</div>
        ) : codes.length === 0 ? (
          <div className={styles.emptyState}>{t("codesTab.noCodesYet")}</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("codesTab.headers.code")}</th>
                    <th>{t("groupHeader")}</th>
                    <th>{t("codesTab.headers.redemptions")}</th>
                    <th>{t("codesTab.headers.expiry")}</th>
                    <th>{t("codesTab.headers.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.code}>
                      <td>
                        <span className={styles.codeText}>{c.code}</span>
                      </td>
                      <td>
                        {c.groupId ? (
                          groupLabel(c.groupId)
                        ) : (
                          <span className={styles.autoAssignedBadge}>
                            {t("codesTab.autoAssigned")}
                          </span>
                        )}
                      </td>
                      <td>
                        {c.redemptionCount}/{c.maxRedemptions ?? "∞"}
                      </td>
                      <td>{fmtDateTime(c.expiresAt)}</td>
                      <td>
                        {c.redemptionCount > 0 ? (
                          <span
                            className={styles.revokeDisabled}
                            title={t("codesTab.cannotRevokeTitle")}
                          >
                            {t("codesTab.revoke")}
                          </span>
                        ) : (
                          <button
                            className={styles.revokeBtn}
                            onClick={() => handleRevoke(c.code)}
                            disabled={revoking === c.code}
                          >
                            {revoking === c.code
                              ? t("codesTab.revokingEllipsis")
                              : t("codesTab.revoke")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  {t("pagination.prev")}
                </button>
                <span className={styles.pageInfo}>
                  {t("pagination.pageInfo", { page, totalPages, total })}
                </span>
                <button
                  className={styles.pageBtn}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  {t("pagination.next")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Participants tab ───────────────────────────────────────────────────────────

interface EnrollmentRow {
  userId: string;
  groupId: string | null;
  groupLabel: string;
  enrolledAt: string | null;
  codeUsed: string | null;
}

interface ParticipantSummary {
  total: number;
  perGroup: { groupId: string; groupLabel: string; count: number }[];
}

function ParticipantsTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const PARTICIPANTS_BASE = apiUrl(`/admin/studies/${study.id}/participants`);

  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [summary, setSummary] = useState<ParticipantSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setLoadError("");
      try {
        const data = await apiFetch(`${PARTICIPANTS_BASE}?page=${p}&limit=${limit}`, token);
        setRows((data as { participants: EnrollmentRow[] }).participants ?? []);
        setTotal((data as { total: number }).total ?? 0);
        setSummary((data as { summary: ParticipantSummary }).summary ?? null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : t("participantsTab.errors.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [PARTICIPANTS_BASE, token, t]
  );

  useEffect(() => {
    fetchPage(page);
  }, [fetchPage, page]);

  async function handleDownloadCsv() {
    setExporting(true);
    try {
      // Fetch all records (up to 500)
      const data = await apiFetch(`${PARTICIPANTS_BASE}?page=1&limit=500`, token);
      const all: EnrollmentRow[] = (data as { participants: EnrollmentRow[] }).participants ?? [];

      const header = "User ID,Group,Enrolled At,Code Used";
      const csvLines = all.map((r) =>
        [
          `"${r.userId}"`,
          `"${r.groupLabel}"`,
          `"${r.enrolledAt ? new Date(r.enrolledAt).toISOString() : ""}"`,
          `"${r.codeUsed ?? "direct/default"}"`,
        ].join(",")
      );
      const csv = [header, ...csvLines].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${study.name.replace(/[^a-z0-9]/gi, "_")}_participants.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail on export errors
    } finally {
      setExporting(false);
    }
  }

  const EXPORT_BASE = apiUrl(`/admin/studies/${study.id}/export/zip`);

  async function handleExportZip() {
    setExportingZip(true);
    try {
      const res = await fetch(EXPORT_BASE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${study.name.replace(/[^a-z0-9]/gi, "_")}_research_export.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setExportingZip(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.participantsTab}>
      {/* Summary row */}
      {summary && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryStat}>
            <span className={styles.summaryStatLabel}>
              {t("participantsTab.totalEnrolledLabel")}
            </span>
            <span className={styles.summaryStatValue}>{summary.total}</span>
          </span>
          {summary.perGroup.map((g) => (
            <span key={g.groupId} className={styles.summaryStat}>
              <span className={styles.summaryStatLabel}>{g.groupLabel}:</span>
              <span className={styles.summaryStatValue}>{g.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Table header with CSV button */}
      <div className={styles.participantsTableHeader}>
        <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          {t("participantsTab.participantsEnrolledCount", { count: total })}
        </span>
        <button
          className={styles.csvBtn}
          onClick={handleDownloadCsv}
          disabled={exporting || total === 0}
        >
          {exporting ? t("exportingEllipsis") : t("participantsTab.downloadCsv")}
        </button>
        <button
          className={styles.csvBtn}
          onClick={handleExportZip}
          disabled={exportingZip || total === 0}
        >
          {exportingZip ? t("exportingEllipsis") : t("participantsTab.exportZip")}
        </button>
      </div>

      {loadError && <div className={styles.errorMsg}>{loadError}</div>}

      {loading ? (
        <div className={styles.loadingState}>{tc("loading")}</div>
      ) : rows.length === 0 ? (
        <div className={styles.emptyState}>{t("participantsTab.empty")}</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("participantsTab.headers.userId")}</th>
                  <th>{t("groupHeader")}</th>
                  <th>{t("participantsTab.headers.enrolled")}</th>
                  <th>{t("participantsTab.headers.codeUsed")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <span className={styles.userIdCell}>{r.userId}</span>
                    </td>
                    <td>{r.groupLabel}</td>
                    <td>{fmtDate(r.enrolledAt)}</td>
                    <td>
                      {r.codeUsed ? (
                        <span className={styles.codePill}>{r.codeUsed}</span>
                      ) : (
                        <span className={styles.codeDefault}>
                          {t("participantsTab.directDefault")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                {t("pagination.prev")}
              </button>
              <span className={styles.pageInfo}>
                {t("pagination.pageInfo", { page, totalPages, total })}
              </span>
              <button
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("pagination.next")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Notifications tab ─────────────────────────────────────────────────────────

function NotificationsTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetGroupId, setTargetGroupId] = useState("all");
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [toast, setToast] = useState("");

  const [scheduled, setScheduled] = useState<ScheduledNotification[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState("");

  const [sentHistory, setSentHistory] = useState<SentNotification[]>([]);
  const [loadingSent, setLoadingSent] = useState(false);

  const fetchScheduled = useCallback(async () => {
    setLoadingScheduled(true);
    setCancelError("");
    try {
      const data = await apiFetch(
        `${NOTIFICATIONS_BASE}?studyId=${study.id}&status=scheduled`,
        token
      );
      const items = Array.isArray(data)
        ? data
        : ((data as { campaigns?: ScheduledNotification[] }).campaigns ?? data);
      setScheduled(Array.isArray(items) ? items : []);
    } catch {
      // non-critical
    } finally {
      setLoadingScheduled(false);
    }
  }, [study.id, token]);

  const fetchSentHistory = useCallback(async () => {
    setLoadingSent(true);
    try {
      const data = await apiFetch(
        `${NOTIFICATIONS_BASE}?studyId=${study.id}&status=sent&limit=20`,
        token
      );
      const items = Array.isArray(data)
        ? data
        : ((data as { campaigns?: SentNotification[] }).campaigns ?? data);
      setSentHistory(Array.isArray(items) ? (items as SentNotification[]) : []);
    } catch {
      // non-critical
    } finally {
      setLoadingSent(false);
    }
  }, [study.id, token]);

  useEffect(() => {
    fetchScheduled();
    fetchSentHistory();
  }, [fetchScheduled, fetchSentHistory]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function handleSend() {
    if (!title.trim()) {
      setSendError(t("notificationsTab.errors.titleRequired"));
      return;
    }
    if (!body.trim()) {
      setSendError(t("notificationsTab.errors.bodyRequired"));
      return;
    }
    if (sendMode === "schedule" && !scheduledAt) {
      setSendError(t("notificationsTab.errors.scheduledTimeRequired"));
      return;
    }
    setSending(true);
    setSendError("");
    try {
      const payload: Record<string, unknown> = {
        studyId: study.id,
        title: title.trim(),
        body: body.trim(),
        targetType: targetGroupId === "all" ? "all_enrolled" : "group",
        targetIds: targetGroupId === "all" ? [] : [targetGroupId],
      };
      if (sendMode === "schedule") {
        payload.scheduledFor = new Date(scheduledAt).toISOString();
      }

      const result = await apiFetch(NOTIFICATIONS_BASE, token, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (sendMode === "now") {
        const r = result as { recipientCount?: number };
        showToast(t("notificationsTab.sentToCount", { count: r.recipientCount ?? 0 }));
      } else {
        showToast(
          t("notificationsTab.scheduledForDate", {
            date: new Date(scheduledAt).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          })
        );
        await fetchScheduled();
      }
      setTitle("");
      setBody("");
      setTargetGroupId("all");
      setSendMode("now");
      setScheduledAt("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("notificationsTab.errors.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function handleCancel(id: string) {
    setCancellingId(id);
    setCancelError("");
    try {
      await apiFetch(`${NOTIFICATIONS_BASE}/${id}`, token, { method: "DELETE" });
      setScheduled((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : t("notificationsTab.errors.cancelFailed")
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className={styles.notificationsTab}>
      {/* Compose form */}
      <div className={styles.notifSection}>
        <p className={styles.notifSectionTitle}>{t("notificationsTab.composeTitle")}</p>
        {sendError && <div className={styles.errorMsg}>{sendError}</div>}
        {toast && <div className={styles.toastMsg}>{toast}</div>}

        <div className={styles.notifForm}>
          <div className={styles.formGroup}>
            <label className={styles.label}>
              {t("notificationsTab.titleLabel")}{" "}
              <span className={styles.charHint}>
                {t("notificationsTab.charCount", { length: title.length, max: 50 })}
              </span>
            </label>
            <input
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 50))}
              placeholder={t("notificationsTab.titlePlaceholder")}
              maxLength={50}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              {t("notificationsTab.bodyLabel")}{" "}
              <span className={styles.charHint}>
                {t("notificationsTab.charCount", { length: body.length, max: 200 })}
              </span>
            </label>
            <textarea
              className={styles.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 200))}
              placeholder={t("notificationsTab.bodyPlaceholder")}
              maxLength={200}
              rows={3}
            />
          </div>

          <div className={styles.notifFormRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("notificationsTab.targetLabel")}</label>
              <select
                className={styles.select}
                value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}
              >
                <option value="all">{t("notificationsTab.allParticipants")}</option>
                {study.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>{t("notificationsTab.targetHint")}</span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>{t("notificationsTab.sendTimeLabel")}</label>
              <select
                className={styles.select}
                value={sendMode}
                onChange={(e) => setSendMode(e.target.value as "now" | "schedule")}
              >
                <option value="now">{t("notificationsTab.sendNowOption")}</option>
                <option value="schedule">{t("notificationsTab.scheduleOption")}</option>
              </select>
              <span className={styles.hint}>{t("notificationsTab.sendTimeHint")}</span>
            </div>
          </div>

          {sendMode === "schedule" && (
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("notificationsTab.scheduledAtLabel")}</label>
              <input
                className={styles.input}
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
          )}

          <div className={styles.notifFormFooter}>
            <button className={styles.saveBtn} onClick={handleSend} disabled={sending}>
              {sending
                ? t("notificationsTab.sendingEllipsis")
                : sendMode === "now"
                  ? t("notificationsTab.send")
                  : t("notificationsTab.scheduleOption")}
            </button>
          </div>
        </div>
      </div>

      {/* Scheduled notifications */}
      <div className={styles.notifSection}>
        <p className={styles.notifSectionTitle}>{t("notificationsTab.scheduledSectionTitle")}</p>
        {cancelError && <div className={styles.errorMsg}>{cancelError}</div>}
        {loadingScheduled ? (
          <div className={styles.loadingState}>{tc("loading")}</div>
        ) : scheduled.length === 0 ? (
          <div className={styles.notifEmpty}>{t("notificationsTab.noScheduled")}</div>
        ) : (
          <div className={styles.scheduledList}>
            {scheduled.map((n) => (
              <div key={n.id} className={styles.scheduledItem}>
                <div className={styles.scheduledItemMain}>
                  <span className={styles.scheduledTitle}>{n.title}</span>
                  <span className={styles.scheduledBody}>{n.body}</span>
                  <span className={styles.scheduledMeta}>
                    {n.targetType === "group" && n.targetIds.length > 0
                      ? (study.groups.find((g) => n.targetIds.includes(g.id))?.label ??
                        n.targetIds[0])
                      : t("notificationsTab.allParticipants")}
                    {" · "}
                    {fmtDateTime(n.scheduledFor)}
                  </span>
                </div>
                <button
                  className={styles.revokeBtn}
                  onClick={() => handleCancel(n.id)}
                  disabled={cancellingId === n.id}
                >
                  {cancellingId === n.id ? t("notificationsTab.cancellingEllipsis") : tc("cancel")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sent notification history */}
      <div className={styles.notifSection}>
        <p className={styles.notifSectionTitle}>{t("notificationsTab.sentHistoryTitle")}</p>
        {loadingSent ? (
          <div className={styles.loadingState}>{tc("loading")}</div>
        ) : sentHistory.length === 0 ? (
          <div className={styles.notifEmpty}>{t("notificationsTab.noSentHistory")}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("notificationsTab.titleLabel")}</th>
                  <th>{t("notificationsTab.targetLabel")}</th>
                  <th>{t("notificationsTab.headers.recipients")}</th>
                  <th>{t("notificationsTab.headers.sentAt")}</th>
                </tr>
              </thead>
              <tbody>
                {sentHistory.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <span className={styles.scheduledTitle}>{n.title}</span>
                      <span
                        className={styles.scheduledBody}
                        style={{ display: "block", fontSize: "0.78rem" }}
                      >
                        {n.body}
                      </span>
                    </td>
                    <td>
                      {n.targetType === "group" && n.targetIds.length > 0
                        ? (study.groups.find((g) => n.targetIds.includes(g.id))?.label ??
                          n.targetIds[0])
                        : t("notificationsTab.allParticipants")}
                    </td>
                    <td>{n.recipientCount ?? "—"}</td>
                    <td>{fmtDateTime(n.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cue config tab ────────────────────────────────────────────────────────────

/** Maps a nullable boolean override to the tri-state <select> value. */
function triStateValue(v: boolean | null): "inherit" | "on" | "off" {
  if (v === null || v === undefined) return "inherit";
  return v ? "on" : "off";
}

/** Parses a tri-state <select> value back to a nullable boolean override. */
function triStateParse(v: string): boolean | null {
  if (v === "on") return true;
  if (v === "off") return false;
  return null;
}

function CueConfigTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const { activityTypes, loading: catalogLoading } = useActivityTypes(token);

  const [groupStates, setGroupStates] = useState<
    Record<
      string,
      CueConfig & {
        onboardingEnabled: boolean | null;
        selfHabitCreationEnabled: boolean | null;
        saving: boolean;
        saved: boolean;
        error: string;
      }
    >
  >(() =>
    Object.fromEntries(
      study.groups.map((g) => [
        g.id,
        {
          cueCount: g.cueConfig?.cueCount ?? "multi",
          cueSource: g.cueConfig?.cueSource ?? "high_quality",
          cuePoolId: g.cueConfig?.cuePoolId ?? null,
          // A group with no saved cueConfig at all (e.g. the seeded default
          // study) behaves as free-text habit entry at runtime
          // (resolveHabitConfig falls back to PUBLIC_FREE_ENTRY) — default
          // to an empty array here too, so the tab reflects that instead of
          // showing every isDefault catalog entry pre-checked but unsaved.
          behaviorOptions: g.cueConfig?.behaviorOptions ?? [],
          maxHabits: g.cueConfig?.maxHabits ?? null,
          // null = inherit study-level flag
          onboardingEnabled: g.onboardingEnabled ?? null,
          selfHabitCreationEnabled: g.selfHabitCreationEnabled ?? null,
          saving: false,
          saved: false,
          error: "",
        },
      ])
    )
  );

  function update(groupId: string, patch: Partial<(typeof groupStates)[string]>) {
    setGroupStates((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], ...patch, saved: false },
    }));
  }

  async function handleSave(groupId: string) {
    const s = groupStates[groupId];
    update(groupId, { saving: true, error: "" });
    try {
      await apiFetch(`${API_BASE}/${study.id}/groups/${groupId}/cue-config`, token, {
        method: "PATCH",
        body: JSON.stringify({
          cueCount: s.cueCount,
          cueSource: s.cueSource,
          cuePoolId: s.cuePoolId,
          // Explicit: [] means free text, never silently substituted with
          // the platform defaults.
          behaviorOptions: s.behaviorOptions,
          maxHabits: s.maxHabits,
        }),
      });
      // Persist the per-group onboarding / self-creation overrides.
      await apiFetch(`${API_BASE}/${study.id}/groups/${groupId}/config`, token, {
        method: "PATCH",
        body: JSON.stringify({
          onboardingEnabled: s.onboardingEnabled,
          selfHabitCreationEnabled: s.selfHabitCreationEnabled,
        }),
      });
      update(groupId, { saving: false, saved: true });
    } catch (err) {
      update(groupId, {
        saving: false,
        error: err instanceof Error ? err.message : t("saveFailedGeneric"),
      });
    }
  }

  if (study.groups.length === 0) {
    return <div className={styles.emptyState}>{t("cueConfigTab.noGroups")}</div>;
  }

  if (catalogLoading) {
    return <div className={styles.emptyState}>{t("cueConfigTab.loadingCatalog")}</div>;
  }

  return (
    <div>
      <ActivityTypesManager token={token} />
      {study.groups.map((g) => {
        const s = groupStates[g.id];
        if (!s) return null;
        return (
          <div key={g.id} className={styles.cueConfigGroup}>
            <p className={styles.cueConfigGroupLabel}>
              {g.label || t("groupFallbackLabel", { index: g.index })}
            </p>
            {s.error && <div className={styles.errorMsg}>{s.error}</div>}
            <CueConfigForm
              value={{
                cueCount: s.cueCount,
                cueSource: s.cueSource,
                behaviorOptions: s.behaviorOptions,
                maxHabits: s.maxHabits,
              }}
              onChange={(patch) => update(g.id, patch)}
              activityTypes={activityTypes}
              showMaxHabits
            />
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>{t("cueConfigTab.onboardingLabel")}</label>
                <select
                  className={styles.select}
                  value={triStateValue(s.onboardingEnabled)}
                  onChange={(e) =>
                    update(g.id, {
                      onboardingEnabled: triStateParse(e.target.value),
                    })
                  }
                >
                  <option value="inherit">{t("cueConfigTab.inheritOption")}</option>
                  <option value="on">{t("cueConfigTab.onOption")}</option>
                  <option value="off">{t("cueConfigTab.offOption")}</option>
                </select>
                <span className={styles.hint}>{t("cueConfigTab.onboardingHint")}</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>{t("cueConfigTab.selfHabitLabel")}</label>
                <select
                  className={styles.select}
                  value={triStateValue(s.selfHabitCreationEnabled)}
                  onChange={(e) =>
                    update(g.id, {
                      selfHabitCreationEnabled: triStateParse(e.target.value),
                    })
                  }
                >
                  <option value="inherit">{t("cueConfigTab.inheritOption")}</option>
                  <option value="on">{t("cueConfigTab.onOption")}</option>
                  <option value="off">{t("cueConfigTab.offOption")}</option>
                </select>
                <span className={styles.hint}>{t("cueConfigTab.selfHabitHint")}</span>
              </div>
            </div>
            <div className={styles.cueConfigFooter}>
              {s.saved && <span className={styles.savedMsg}>{t("saved")}</span>}
              <button
                className={styles.saveBtn}
                onClick={() => handleSave(g.id)}
                disabled={s.saving}
              >
                {s.saving ? tc("saving") : tc("save")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Study form modal ──────────────────────────────────────────────────────────

type ModalTab =
  | "details"
  | "questionnaires"
  | "schedule"
  | "codes"
  | "participants"
  | "notifications"
  | "cue-config";

function StudyModal({
  initial,
  token,
  onClose,
  onSaved,
  onSetDefault,
  onDeactivate,
  onDelete,
}: {
  initial: StudySummary | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
  onSetDefault: (id: string) => Promise<void>;
  onDeactivate: (id: string) => Promise<{ error?: string } | void>;
  onDelete: (id: string, confirmName: string) => Promise<{ error?: string } | void>;
}) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const isEdit = initial !== null;
  const [activeTab, setActiveTab] = useState<ModalTab>("details");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [recommenderEnabled, setRecommenderEnabled] = useState(initial?.recommenderEnabled ?? true);
  const [onboardingEnabled, setOnboardingEnabled] = useState(initial?.onboardingEnabled ?? true);
  const [selfHabitCreationEnabled, setSelfHabitCreationEnabled] = useState(
    initial?.selfHabitCreationEnabled ?? true
  );
  const [remindersEnabled, setRemindersEnabled] = useState(
    initial?.questionnaireReminders?.enabled ?? true
  );
  const [reminderHour, setReminderHour] = useState(initial?.questionnaireReminders?.hour ?? 9);
  const [endDate, setEndDate] = useState(initial?.endDate ? initial.endDate.slice(0, 10) : "");
  const [endOfStudyEnabled, setEndOfStudyEnabled] = useState(
    initial?.endOfStudyNotification?.enabled ?? false
  );
  const [endOfStudyTitle, setEndOfStudyTitle] = useState(
    initial?.endOfStudyNotification?.title ?? "Study complete"
  );
  const [endOfStudyBody, setEndOfStudyBody] = useState(
    initial?.endOfStudyNotification?.body ?? "Thank you for participating — your study has ended."
  );
  const [groupCount, setGroupCount] = useState(initial?.groups.length ?? 1);
  const [groupLabels, setGroupLabels] = useState<string[]>(() => {
    if (initial) return initial.groups.map((g) => g.label);
    return [""];
  });
  // Tracks each slot's existing group id (if any) so edits are matched back
  // to the same group instead of being recreated; undefined slots are new
  // groups. Shrinking the count drops ids from the end.
  const [groupIds, setGroupIds] = useState<(string | undefined)[]>(() => {
    if (initial) return initial.groups.map((g) => g.id);
    return [undefined];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deactivating, setDeactivating] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [confirmDefaultOpen, setConfirmDefaultOpen] = useState(false);

  // Delete flow (download data → type name → confirm).
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteNameInput, setDeleteNameInput] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleGroupCountChange(n: number) {
    setGroupCount(n);
    setGroupLabels((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("");
      return next.slice(0, n);
    });
    setGroupIds((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(undefined);
      return next.slice(0, n);
    });
  }

  function handleGroupLabelChange(i: number, val: string) {
    setGroupLabels((prev) => prev.map((l, idx) => (idx === i ? val : l)));
  }

  async function handleSave() {
    if (!name.trim()) {
      setError(t("modal.errors.nameRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const groups = groupLabels.slice(0, groupCount).map((label, i) => ({
          label: label.trim() || `Group ${i + 1}`,
          ...(groupIds[i] ? { id: groupIds[i] } : {}),
        }));
        await apiFetch(`${API_BASE}/${initial!.id}`, token, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            groups,
            recommenderEnabled,
            onboardingEnabled,
            selfHabitCreationEnabled,
            questionnaireReminders: { enabled: remindersEnabled, hour: reminderHour },
            endDate: endDate ? new Date(`${endDate}T00:00:00Z`).toISOString() : null,
            endOfStudyNotification: {
              enabled: endOfStudyEnabled && !!endDate,
              title: endOfStudyTitle.trim() || "Study complete",
              body: endOfStudyBody.trim() || "Thank you for participating — your study has ended.",
            },
          }),
        });
      } else {
        // Group labels are required (min 1 char) on the server — fall back to
        // "Group N" for any left blank so create doesn't 400.
        const groups = groupLabels
          .slice(0, groupCount)
          .map((label, i) => ({ label: label.trim() || `Group ${i + 1}` }));
        await apiFetch(API_BASE, token, {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            recommenderEnabled,
            onboardingEnabled,
            selfHabitCreationEnabled,
            groups,
            endDate: endDate ? new Date(`${endDate}T00:00:00Z`).toISOString() : null,
            endOfStudyNotification: {
              enabled: endOfStudyEnabled && !!endDate,
              title: endOfStudyTitle.trim() || "Study complete",
              body: endOfStudyBody.trim() || "Thank you for participating — your study has ended.",
            },
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailedGeneric"));
    } finally {
      setSaving(false);
    }
  }

  function handleSetDefaultClick() {
    setConfirmDefaultOpen(true);
  }

  async function handleSetDefaultConfirm() {
    if (!initial) return;
    setConfirmDefaultOpen(false);
    setSettingDefault(true);
    setError("");
    try {
      await onSetDefault(initial.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("modal.errors.setDefaultFailed"));
    } finally {
      setSettingDefault(false);
    }
  }

  async function handleDeactivate() {
    if (!initial) return;
    setDeactivating(true);
    setError("");
    try {
      const result = await onDeactivate(initial.id);
      if (result && (result as { error?: string }).error) {
        setError((result as { error: string }).error);
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("modal.errors.deactivateFailed"));
    } finally {
      setDeactivating(false);
    }
  }

  async function handleDownloadData() {
    if (!initial) return;
    setDownloading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/${initial.id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(t("modal.errors.exportFailedHttp", { status: res.status }));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      const safe = (initial.name || "study")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      a.download = `study-${safe || "export"}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("modal.errors.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!initial) return;
    setDeleting(true);
    setError("");
    try {
      const result = await onDelete(initial.id, deleteNameInput);
      if (result && (result as { error?: string }).error) {
        setError((result as { error: string }).error);
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("modal.errors.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            {isEdit ? t("modal.editTitle") : t("modal.newTitle")}
          </span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        {isEdit && (
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === "details" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("details")}
            >
              {t("modal.tabs.details")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "questionnaires" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("questionnaires")}
            >
              {t("modal.tabs.questionnaires")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "schedule" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("schedule")}
            >
              {t("modal.tabs.schedule")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "codes" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("codes")}
            >
              {t("modal.tabs.codes")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "participants" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("participants")}
            >
              {t("modal.tabs.participants")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "notifications" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("notifications")}
            >
              {t("modal.tabs.notifications")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "cue-config" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("cue-config")}
            >
              {t("modal.tabs.cueConfig")}
            </button>
          </div>
        )}

        <div className={styles.modalBody}>
          {activeTab === "details" ? (
            <>
              {error && <div className={styles.errorMsg}>{error}</div>}

              {isEdit && initial?.isDefault && (
                <div className={styles.defaultBadgeRow}>
                  <span className={styles.badgeDefault}>{t("modal.defaultBadge")}</span>
                </div>
              )}

              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.label}>{t("modal.fields.nameLabel")}</label>
                  <input
                    className={styles.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("modal.fields.namePlaceholder")}
                  />
                  <span className={styles.hint}>{t("modal.fields.nameHint")}</span>
                </div>

                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.label}>{tc("description")}</label>
                  <textarea
                    className={styles.textarea}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("modal.fields.descriptionPlaceholder")}
                  />
                  <span className={styles.hint}>{t("modal.fields.descriptionHint")}</span>
                </div>

                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={recommenderEnabled}
                      onChange={(e) => setRecommenderEnabled(e.target.checked)}
                    />
                    {t("modal.fields.recommenderLabel")}
                  </label>
                  <span className={styles.hint}>{t("modal.fields.recommenderHint")}</span>
                </div>

                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={onboardingEnabled}
                      onChange={(e) => setOnboardingEnabled(e.target.checked)}
                    />
                    {t("modal.fields.onboardingLabel")}
                  </label>
                  <span className={styles.hint}>{t("modal.fields.onboardingHint")}</span>
                </div>

                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={selfHabitCreationEnabled}
                      onChange={(e) => setSelfHabitCreationEnabled(e.target.checked)}
                    />
                    {t("modal.fields.selfHabitLabel")}
                  </label>
                  <span className={styles.hint}>{t("modal.fields.selfHabitHint")}</span>
                </div>

                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={remindersEnabled}
                      onChange={(e) => setRemindersEnabled(e.target.checked)}
                    />
                    {t("modal.fields.remindersLabel")}
                  </label>
                  <span className={styles.hint}>{t("modal.fields.remindersHint")}</span>
                  {remindersEnabled && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span className={styles.label} style={{ margin: 0 }}>
                        {t("modal.fields.reminderTimeLabel")}
                      </span>
                      <select
                        className={styles.select}
                        value={reminderHour}
                        onChange={(e) => setReminderHour(parseInt(e.target.value, 10))}
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.label}>{t("modal.fields.endDateLabel")}</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  <span className={styles.hint}>{t("modal.fields.endDateHint")}</span>
                </div>

                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={endOfStudyEnabled}
                      onChange={(e) => setEndOfStudyEnabled(e.target.checked)}
                      disabled={!endDate}
                    />
                    {t("modal.fields.endOfStudyLabel")}
                  </label>
                  <span className={styles.hint}>
                    {endDate
                      ? t("modal.fields.endOfStudyHintEnabled")
                      : t("modal.fields.endOfStudyHintDisabled")}
                  </span>
                  {endOfStudyEnabled && endDate && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <div>
                        <span className={styles.label} style={{ margin: 0 }}>
                          {t("modal.fields.notificationTitleLabel")}
                        </span>
                        <input
                          className={styles.input}
                          value={endOfStudyTitle}
                          onChange={(e) => setEndOfStudyTitle(e.target.value)}
                          maxLength={120}
                        />
                      </div>
                      <div>
                        <span className={styles.label} style={{ margin: 0 }}>
                          {t("modal.fields.notificationBodyLabel")}
                        </span>
                        <input
                          className={styles.input}
                          value={endOfStudyBody}
                          onChange={(e) => setEndOfStudyBody(e.target.value)}
                          maxLength={500}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>{t("modal.fields.groupCountLabel")}</label>
                  <select
                    className={styles.select}
                    value={groupCount}
                    onChange={(e) => handleGroupCountChange(Number(e.target.value))}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                  </select>
                  <span className={styles.hint}>{t("modal.fields.groupCountHint")}</span>
                  {isEdit && groupCount < (initial?.groups.length ?? groupCount) && (
                    <span className={styles.hint} style={{ color: "#b45309" }}>
                      {t("modal.fields.groupCountRemovalWarning")}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.groupLabelsSection}>
                <p className={styles.groupLabelsTitle}>{t("modal.fields.groupLabelsTitle")}</p>
                <div className={styles.groupLabelsGrid}>
                  {Array.from({ length: groupCount }).map((_, i) => (
                    <div key={i} className={styles.formGroup}>
                      <label className={styles.label}>
                        {t("groupFallbackLabel", { index: i + 1 })}
                      </label>
                      <input
                        className={styles.input}
                        value={groupLabels[i] ?? ""}
                        onChange={(e) => handleGroupLabelChange(i, e.target.value)}
                        placeholder={t("groupFallbackLabel", { index: i + 1 })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : activeTab === "questionnaires" ? (
            initial && <QuestionnairesTab study={initial} token={token} onSaved={onSaved} />
          ) : activeTab === "schedule" ? (
            initial && <QuestionnaireScheduleTab study={initial} token={token} />
          ) : activeTab === "codes" ? (
            initial && <CodesTab study={initial} token={token} />
          ) : activeTab === "participants" ? (
            initial && <ParticipantsTab study={initial} token={token} />
          ) : activeTab === "cue-config" ? (
            initial && <CueConfigTab study={initial} token={token} />
          ) : (
            initial && <NotificationsTab study={initial} token={token} />
          )}
        </div>

        {confirmDefaultOpen && (
          <div className={styles.confirmDialog}>
            <p className={styles.confirmMsg}>
              {t.rich("modal.confirmDefault.message", {
                name: initial?.name ?? "",
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDefaultOpen(false)}>
                {tc("cancel")}
              </button>
              <button className={styles.defaultBtn} onClick={handleSetDefaultConfirm}>
                {tc("confirm")}
              </button>
            </div>
          </div>
        )}

        {confirmDeleteOpen && (
          <div className={styles.confirmDialog}>
            <p className={styles.confirmMsg}>
              {t.rich("modal.confirmDelete.message", {
                name: initial?.name ?? "",
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <button
              className={styles.downloadBtn}
              onClick={handleDownloadData}
              disabled={downloading}
            >
              {downloading
                ? t("modal.confirmDelete.downloadingEllipsis")
                : t("modal.confirmDelete.downloadButton")}
            </button>
            <label className={styles.confirmLabel}>
              {t.rich("modal.confirmDelete.typeNameLabel", {
                name: initial?.name ?? "",
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </label>
            <input
              className={styles.confirmInput}
              value={deleteNameInput}
              onChange={(e) => setDeleteNameInput(e.target.value)}
              placeholder={initial?.name ?? ""}
              autoFocus
            />
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deleting}
              >
                {tc("cancel")}
              </button>
              <button
                className={styles.deleteBtn}
                onClick={handleDeleteConfirm}
                disabled={deleting || deleteNameInput.trim() !== (initial?.name ?? "").trim()}
              >
                {deleting ? tc("deletingEllipsis") : t("modal.confirmDelete.deleteButton")}
              </button>
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div className={styles.modalFooter}>
            {isEdit && (
              <div className={styles.modalFooterLeft}>
                {!initial?.isDefault && (
                  <button
                    className={styles.defaultBtn}
                    onClick={handleSetDefaultClick}
                    disabled={settingDefault}
                  >
                    {settingDefault
                      ? t("modal.footer.settingDefaultEllipsis")
                      : t("modal.footer.setDefault")}
                  </button>
                )}
                {initial?.isActive &&
                  (initial?.isDefault ? (
                    <button
                      className={styles.deactivateBtn}
                      disabled
                      title={t("modal.footer.deactivateDisabledTitle")}
                    >
                      {t("modal.footer.deactivate")}
                    </button>
                  ) : (
                    <button
                      className={styles.deactivateBtn}
                      onClick={handleDeactivate}
                      disabled={deactivating}
                    >
                      {deactivating
                        ? t("modal.footer.deactivatingEllipsis")
                        : t("modal.footer.deactivate")}
                    </button>
                  ))}
                {!initial?.isDefault && (
                  <button
                    className={styles.deleteBtn}
                    onClick={() => {
                      setDeleteNameInput("");
                      setError("");
                      setConfirmDeleteOpen(true);
                    }}
                  >
                    {tc("delete")}
                  </button>
                )}
              </div>
            )}
            <div className={styles.modalFooterRight}>
              <button className={styles.cancelBtn} onClick={onClose}>
                {tc("cancel")}
              </button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving
                  ? tc("saving")
                  : isEdit
                    ? t("modal.footer.saveChanges")
                    : t("modal.footer.create")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

/**
 * Displays and manages research studies, including groups, participants,
 * questionnaire assignments, codes, notifications, and cue configuration.
 *
 * @returns The studies management page.
 */
export default function StudiesPage() {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const { studies, loading, error, token, refetch: fetchList } = useStudiesData();
  const [actionError, setActionError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StudySummary | null>(null);

  function handleOpenCreate() {
    setEditTarget(null);
    setModalOpen(true);
    setActionError("");
  }

  function handleOpenEdit(study: StudySummary) {
    setEditTarget(study);
    setModalOpen(true);
    setActionError("");
  }

  function handleModalClose() {
    setModalOpen(false);
    setEditTarget(null);
  }

  async function handleModalSaved() {
    setModalOpen(false);
    setEditTarget(null);
    await fetchList();
  }

  async function handleSetDefault(id: string) {
    await apiFetch(`${API_BASE}/${id}/default`, token, { method: "PUT" });
  }

  async function handleDeactivate(id: string): Promise<{ error?: string } | void> {
    try {
      await apiFetch(`${API_BASE}/${id}`, token, { method: "DELETE" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("modal.errors.deactivateFailed");
      // 409 means participants enrolled — return as error to show inline
      return { error: msg };
    }
  }

  async function handleDelete(id: string, confirmName: string): Promise<{ error?: string } | void> {
    try {
      await apiFetch(`${API_BASE}/${id}/delete`, token, {
        method: "POST",
        body: JSON.stringify({ confirmName }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("modal.errors.deleteFailed");
      return { error: msg };
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <button className={styles.addButton} onClick={handleOpenCreate}>
          {t("newStudy")}
        </button>
      </div>

      {actionError && <div className={styles.errorMsg}>{actionError}</div>}

      {loading ? (
        <div className={styles.loadingState}>{tc("loading")}</div>
      ) : error ? (
        <div className={styles.errorMsg}>{error}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{tc("name")}</th>
                <th>{tc("status")}</th>
                <th>{t("table.groups")}</th>
                <th>{t("table.participants")}</th>
                <th>{tc("createdAt")}</th>
                <th>{tc("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {studies.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.emptyState}>
                      {t("table.noStudiesYet", { button: t("newStudy") })}
                    </div>
                  </td>
                </tr>
              ) : (
                studies.map((study) => (
                  <tr
                    key={study.id}
                    className={styles.clickableRow}
                    onClick={() => handleOpenEdit(study)}
                  >
                    <td>
                      <span className={styles.studyName}>{study.name}</span>
                      {study.isDefault && (
                        <span className={styles.badgeDefault}>{t("table.default")}</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          study.isActive ? styles.badgeActive : styles.badgeInactive
                        }`}
                      >
                        {study.isActive ? t("table.active") : t("table.inactive")}
                      </span>
                    </td>
                    <td>{study.groups.length}</td>
                    <td>{study.participantCount ?? 0}</td>
                    <td>{fmtDate(study.createdAt)}</td>
                    <td>
                      <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.actionBtn} onClick={() => handleOpenEdit(study)}>
                          {tc("edit")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <StudyModal
          initial={editTarget}
          token={token}
          onClose={handleModalClose}
          onSaved={handleModalSaved}
          onSetDefault={handleSetDefault}
          onDeactivate={handleDeactivate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
