"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./page.module.css";

import { useStudiesData } from "./useStudiesData";
import { apiFetch, apiUrl } from "@/lib/api";
import { useActivityTypes } from "@/lib/useActivityTypes";
import { CueConfigForm } from "@/components/cue-config-form";
import { HabitEntryModeForm } from "@/components/habit-entry-mode-form";
import { ActivityTypesManager } from "@/components/activity-types-manager";
import { ToggleSwitch } from "@/components/toggle-switch";

// ── Types ─────────────────────────────────────────────────────────────────────

/** One reminder type's mode + time. See app/services/reminderConfigService.js. */
export type ReminderModeValue = {
  mode: "off" | "participant_choice" | "admin_fixed";
  time: string | null;
};

export interface RemindersConfig {
  habit: ReminderModeValue;
  questionnaire: ReminderModeValue;
  endOfStudy: ReminderModeValue;
  studyUpdate: ReminderModeValue;
}

/** Per-group overrides: each type independently null = inherit study-level. */
export type GroupRemindersConfig = {
  habit: ReminderModeValue | null;
  questionnaire: ReminderModeValue | null;
  endOfStudy: ReminderModeValue | null;
  studyUpdate: ReminderModeValue | null;
} | null;

interface StudyGroup {
  id: string;
  label: string;
  index: number;
  allocationWeight?: number;
  cueConfig?: CueConfig | null;
  // null = inherit the study-level flag; boolean overrides per group.
  onboardingEnabled?: boolean | null;
  selfHabitCreationEnabled?: boolean | null;
  recommenderEnabled?: boolean | null;
  // null = inherit the study-level habit-entry-mode setting for this group.
  habitEntryMode?: "freeText" | "structured" | null;
  structuredActivityKeys?: string[] | null;
  reminders?: GroupRemindersConfig;
  // §7.1/§7.2/§7.3/§7.5 group-level overrides (null = inherit study-level).
  habitStackingEnabled?: boolean | null;
  reminderContentMode?: "generic" | "implementation_intention" | null;
  informationOverloadGuard?: InformationOverloadGuard | null;
  gamificationEnabled?: boolean | null;
}

/** §7.3 Information Overload guard — a growing per-type habit cap. */
interface InformationOverloadGuard {
  enabled: boolean;
  userOptOutAllowed: boolean;
}

interface CueConfig {
  cueCount: "single" | "multi";
  cueSource: "low_quality" | "high_quality" | "self_selected";
  cuePoolId: string | null;
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
  /** Study-wide — applies to every group. Off (default) = free-text habit entry. */
  habitEntryMode: "freeText" | "structured";
  /** Activity-type catalog keys offered when habitEntryMode is 'structured'. */
  structuredActivityKeys: string[];
  // §7.1/§7.2/§7.3/§7.5 study-level feature config.
  habitStackingEnabled: boolean;
  reminderContentMode: "generic" | "implementation_intention";
  informationOverloadGuard: InformationOverloadGuard | null;
  gamificationEnabled: boolean;
  reminders?: RemindersConfig;
  endDate?: string | null;
  endOfStudyNotification?: { title: string; body: string };
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
  scope: "study" | "habit";
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

// ── Questionnaires tab (unified list + inline scheduling) ─────────────────────

interface Cadence {
  mode: "interval" | "fixed";
  startOffsetDays?: number;
  intervalDays?: number;
  occurrences?: number;
  continuous?: boolean;
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
 * One row per questionnaire (library + custom): a toggle turns it on/off for
 * this study, and — only while on — exposes an inline cadence editor. A
 * questionnaire's `scope` (set on its definition) decides which cadence
 * fields the editor shows: 'study' anchors to enrollment (editable "first
 * due"), 'habit' anchors to each habit's creation (fixed ~5s delay, applies
 * once per habit instead of once per participant). Group-specific overrides
 * and a calendar preview live under each row.
 */
function QuestionnairesTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const [allQuestionnaires, setAllQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [completion, setCompletion] = useState<Completion[]>([]);
  const [calendar, setCalendar] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [pendingOn, setPendingOn] = useState<Set<string>>(new Set());

  const base = `${API_BASE}/${study.id}/questionnaire-assignments`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qs, data, cal] = await Promise.all([
        apiFetch(QUESTIONNAIRES_API, token),
        apiFetch(base, token),
        apiFetch(`${API_BASE}/${study.id}/questionnaire-calendar`, token).catch(() => ({
          calendar: [],
        })),
      ]);
      setAllQuestionnaires(Array.isArray(qs) ? (qs as QuestionnaireSummary[]) : []);
      setAssignments((data.assignments ?? []) as ScheduleAssignment[]);
      setCompletion((data.completion ?? []) as Completion[]);
      setCalendar((cal?.calendar ?? []) as CalendarEntry[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scheduleTab.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [base, token, study.id, t]);

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

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function setRowExpanded(id: string, value: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleToggle(q: QuestionnaireSummary, assignment: ScheduleAssignment | undefined) {
    if (!assignment) {
      // No real assignment to derive `checked` from yet: flip a local
      // "pending on" flag so the switch shows on/green immediately and the
      // cadence editor expands/collapses in sync. Nothing is persisted
      // until the admin saves a cadence via handleCreate, which clears
      // this flag once the real assignment lands.
      const turningOn = !pendingOn.has(q.id);
      setPendingOn((prev) => {
        const next = new Set(prev);
        if (turningOn) next.add(q.id);
        else next.delete(q.id);
        return next;
      });
      setRowExpanded(q.id, turningOn);
      return;
    }
    setBusy(q.id, true);
    try {
      await apiFetch(`${base}/${assignment.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ active: !assignment.active }),
      });
      setRowExpanded(q.id, !assignment.active);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailedGeneric"));
    } finally {
      setBusy(q.id, false);
    }
  }

  async function handleCreate(
    q: QuestionnaireSummary,
    cadence: Cadence,
    groupId: string | null = null
  ) {
    setBusy(q.id, true);
    try {
      await apiFetch(base, token, {
        method: "POST",
        body: JSON.stringify({ questionnaireId: q.id, groupId, cadence }),
      });
      if (!groupId) {
        // Only the study-wide create corresponds to the pending flag — a
        // group override can be added independently while the study-wide
        // assignment is still pending.
        setPendingOn((prev) => {
          if (!prev.has(q.id)) return prev;
          const next = new Set(prev);
          next.delete(q.id);
          return next;
        });
      }
      await load();
    } catch (e) {
      throw e instanceof Error ? e : new Error(t("scheduleTab.errors.addFailed"));
    } finally {
      setBusy(q.id, false);
    }
  }

  async function handleUpdateCadence(
    q: QuestionnaireSummary,
    assignment: ScheduleAssignment,
    cadence: Cadence
  ) {
    setBusy(q.id, true);
    try {
      await apiFetch(`${base}/${assignment.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ cadence }),
      });
      await load();
    } catch (e) {
      throw e instanceof Error ? e : new Error(t("saveFailedGeneric"));
    } finally {
      setBusy(q.id, false);
    }
  }

  async function handleRemove(q: QuestionnaireSummary, assignment: ScheduleAssignment) {
    if (!confirm(t("scheduleTab.confirmRemove"))) return;
    setBusy(q.id, true);
    try {
      await apiFetch(`${base}/${assignment.id}`, token, { method: "DELETE" });
      setPendingOn((prev) => {
        if (!prev.has(q.id)) return prev;
        const next = new Set(prev);
        next.delete(q.id);
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scheduleTab.errors.deleteFailed"));
    } finally {
      setBusy(q.id, false);
    }
  }

  if (loading) return <div className={styles.loadingState}>{tc("loading")}</div>;

  const library = allQuestionnaires.filter((q) => q.isLibrary);
  const custom = allQuestionnaires.filter((q) => !q.isLibrary);
  const byQuestionnaireId = new Map(
    assignments.filter((a) => !a.groupId).map((a) => [a.questionnaireId, a])
  );
  const overridesByQuestionnaireId = new Map<string, ScheduleAssignment[]>();
  for (const a of assignments) {
    if (!a.groupId) continue;
    const list = overridesByQuestionnaireId.get(a.questionnaireId) ?? [];
    list.push(a);
    overridesByQuestionnaireId.set(a.questionnaireId, list);
  }

  function renderRow(q: QuestionnaireSummary) {
    const assignment = byQuestionnaireId.get(q.id);
    const overrides = overridesByQuestionnaireId.get(q.id) ?? [];
    const isOn = assignment?.active === true;
    const switchOn = isOn || pendingOn.has(q.id);
    const isExpanded = expanded.has(q.id);
    const busy = busyIds.has(q.id);
    // Read-only when peeking at a deactivated assignment's cadence without
    // having toggled it on — editing an off-but-existing schedule requires
    // turning it back on first.
    const editorDisabled = assignment !== undefined && !assignment.active;

    return (
      <div key={q.id} className={styles.qItem}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <ToggleSwitch
            checked={switchOn}
            disabled={busy}
            onChange={() => handleToggle(q, assignment)}
            label={
              <>
                <span className={styles.qTitle}>{previewText(q.title)}</span>
                {!q.active && (
                  <span className={styles.qInactive}>{t("questionnairesTab.inactiveBadge")}</span>
                )}
                <span className={styles.hint} style={{ marginLeft: "0.5rem" }}>
                  {q.scope === "habit"
                    ? t("scheduleTab.scopeHabitBadge")
                    : t("scheduleTab.scopeStudyBadge")}
                </span>
              </>
            }
          />
          <button
            className={styles.saveBtn}
            style={{ background: "transparent", color: "var(--color-text-secondary)" }}
            onClick={() => setRowExpanded(q.id, !isExpanded)}
          >
            {isExpanded ? tc("hide") : tc("details")}
          </button>
        </div>

        {isExpanded && (
          <div className={styles.cueConfigGroup} style={{ marginTop: "0.75rem" }}>
            <CadenceEditor
              questionnaire={q}
              assignment={assignment}
              disabled={editorDisabled || busy}
              onSave={(cadence) =>
                assignment ? handleUpdateCadence(q, assignment, cadence) : handleCreate(q, cadence)
              }
              onRemove={assignment ? () => handleRemove(q, assignment) : undefined}
            />

            {isOn && (
              <p className={styles.hint} style={{ marginTop: "0.5rem" }}>
                {t("scheduleTab.completedHeader")}: {completionFor(q.slug)}
              </p>
            )}

            {overrides.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <p className={styles.qSectionTitle}>{t("scheduleTab.groupOverridesTitle")}</p>
                {overrides.map((o) => (
                  <div key={o.id} className={styles.hint} style={{ marginBottom: "0.35rem" }}>
                    {scopeLabel(o.groupId)}: {o.cadenceSummary} ({o.occurrences}×){" "}
                    <button
                      className={styles.saveBtn}
                      style={{ background: "transparent", color: "#dc2626", padding: 0 }}
                      onClick={() => handleRemove(q, o)}
                    >
                      {t("scheduleTab.remove")}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isOn && study.groups.length > 0 && (
              <GroupOverrideForm
                questionnaire={q}
                groups={study.groups}
                excludeGroupIds={overrides.map((o) => o.groupId).filter((g): g is string => !!g)}
                onAdd={(groupId, cadence) => handleCreate(q, cadence, groupId)}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {error && <div className={styles.errorMsg}>{error}</div>}
      {allQuestionnaires.length === 0 ? (
        <div className={styles.emptyState}>{t("questionnairesTab.empty")}</div>
      ) : (
        <>
          {library.length > 0 && (
            <div className={styles.qSection}>
              <p className={styles.qSectionTitle}>{t("questionnairesTab.libraryTitle")}</p>
              <div className={styles.qList}>{library.map(renderRow)}</div>
            </div>
          )}
          {custom.length > 0 && (
            <div className={styles.qSection}>
              <p className={styles.qSectionTitle}>{t("questionnairesTab.customTitle")}</p>
              <div className={styles.qList}>{custom.map(renderRow)}</div>
            </div>
          )}
        </>
      )}

      {/* Calendar of scheduled questionnaire due dates */}
      <div>
        <p className={styles.qSectionTitle}>{t("scheduleTab.calendarTitle")}</p>
        <p className={styles.hint} style={{ marginTop: "-0.25rem", marginBottom: "0.5rem" }}>
          {t("scheduleTab.calendarHint")}
        </p>
        <ScheduleCalendar entries={calendar} endDate={study.endDate ?? null} />
      </div>
    </div>
  );
}

/**
 * Cadence fields for one assignment (existing or not-yet-created). Fields
 * shown depend on the questionnaire's scope: study-scoped shows the
 * editable "first due" offset; habit-scoped replaces it with a static note,
 * since its first occurrence is fixed at habit creation + ~5s.
 */
function CadenceEditor({
  questionnaire,
  assignment,
  disabled,
  onSave,
  onRemove,
}: {
  questionnaire: QuestionnaireSummary;
  assignment: ScheduleAssignment | undefined;
  disabled: boolean;
  onSave: (cadence: Cadence) => Promise<void>;
  onRemove?: () => void;
}) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const initial = assignment?.cadence;
  const isHabitScoped = questionnaire.scope === "habit";
  const [mode, setMode] = useState<"interval" | "fixed">(initial?.mode ?? "interval");
  const [startOffsetDays, setStartOffsetDays] = useState(initial?.startOffsetDays ?? 0);
  const [intervalDays, setIntervalDays] = useState(initial?.intervalDays ?? 7);
  const [continuous, setContinuous] = useState(initial?.continuous === true);
  const [occurrences, setOccurrences] = useState(initial?.occurrences ?? 8);
  const [weeksStr, setWeeksStr] = useState((initial?.weeks ?? [0, 4, 8]).join(", "));
  const [daysStr, setDaysStr] = useState((initial?.days ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const firstDueDate = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (startOffsetDays || 0));
    return d.toISOString();
  })();

  async function handleSave() {
    setError("");
    const parseList = (s: string) =>
      s
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => !Number.isNaN(n));

    let cadence: Cadence;
    if (mode === "interval") {
      if (intervalDays == null || (!continuous && occurrences == null)) {
        setError(t("scheduleTab.errors.missingInterval"));
        return;
      }
      cadence = {
        mode,
        startOffsetDays: isHabitScoped ? 0 : startOffsetDays,
        intervalDays,
        ...(continuous ? { continuous: true } : { occurrences }),
      };
    } else {
      const weeks = parseList(weeksStr);
      const days = parseList(daysStr);
      if (weeks.length === 0 && days.length === 0) {
        setError(t("scheduleTab.errors.noTimeSlots"));
        return;
      }
      cadence = { mode: "fixed" };
      if (weeks.length) cadence.weeks = weeks;
      if (days.length) cadence.days = days;
    }

    setSaving(true);
    try {
      await onSave(cadence);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailedGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t("scheduleTab.cadenceHeader")}</label>
          <select
            className={styles.select}
            value={mode}
            disabled={disabled}
            onChange={(e) => setMode(e.target.value as "interval" | "fixed")}
          >
            <option value="interval">{t("scheduleTab.intervalOption")}</option>
            <option value="fixed">{t("scheduleTab.fixedOption")}</option>
          </select>
        </div>
      </div>

      {isHabitScoped && <p className={styles.hint}>{t("scheduleTab.habitAnchoredHint")}</p>}

      {mode === "interval" ? (
        <div className={styles.formGrid}>
          {!isHabitScoped && (
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("scheduleTab.firstDueLabel")}</label>
              <input
                className={styles.select}
                type="number"
                min={0}
                value={startOffsetDays}
                disabled={disabled}
                onChange={(e) => setStartOffsetDays(parseInt(e.target.value, 10) || 0)}
              />
              <span className={styles.hint}>
                {t("scheduleTab.firstDueResolved", { date: fmtDate(firstDueDate) })}
              </span>
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("scheduleTab.everyDaysLabel")}</label>
            <input
              className={styles.select}
              type="number"
              min={1}
              value={intervalDays}
              disabled={disabled}
              onChange={(e) => setIntervalDays(parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div className={styles.formGroup}>
            <label
              className={styles.label}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={continuous}
                disabled={disabled}
                onChange={(e) => setContinuous(e.target.checked)}
              />
              {t("scheduleTab.continuousLabel")}
            </label>
            <span className={styles.hint}>{t("scheduleTab.continuousHint")}</span>
          </div>
          {!continuous && (
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("scheduleTab.occurrencesLabel")}</label>
              <input
                className={styles.select}
                type="number"
                min={1}
                value={occurrences}
                disabled={disabled}
                onChange={(e) => setOccurrences(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("scheduleTab.weeksLabel")}</label>
            <input
              className={styles.select}
              value={weeksStr}
              disabled={disabled}
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
              disabled={disabled}
              onChange={(e) => setDaysStr(e.target.value)}
              placeholder={t("scheduleTab.daysPlaceholder")}
            />
            <span className={styles.hint}>{t("scheduleTab.daysHint")}</span>
          </div>
        </div>
      )}

      {error && <div className={styles.errorMsg}>{error}</div>}
      <div className={styles.cueConfigFooter}>
        {onRemove && (
          <button
            className={styles.saveBtn}
            style={{ background: "transparent", color: "#dc2626" }}
            disabled={disabled}
            onClick={onRemove}
          >
            {t("scheduleTab.remove")}
          </button>
        )}
        <button className={styles.saveBtn} onClick={handleSave} disabled={disabled || saving}>
          {saving ? tc("saving") : tc("save")}
        </button>
      </div>
    </div>
  );
}

/** Inline form to add a group-specific cadence override for a questionnaire. */
function GroupOverrideForm({
  questionnaire,
  groups,
  excludeGroupIds,
  onAdd,
}: {
  questionnaire: QuestionnaireSummary;
  groups: StudyGroup[];
  excludeGroupIds: string[];
  onAdd: (groupId: string, cadence: Cadence) => Promise<void>;
}) {
  const t = useTranslations("studies");
  const available = groups.filter((g) => !excludeGroupIds.includes(g.id));
  const [groupId, setGroupId] = useState(available[0]?.id ?? "");
  const [show, setShow] = useState(false);

  if (available.length === 0) return null;

  if (!show) {
    return (
      <button
        className={styles.saveBtn}
        style={{ background: "transparent", marginTop: "0.75rem" }}
        onClick={() => setShow(true)}
      >
        {t("scheduleTab.addGroupOverride")}
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div className={styles.formGroup}>
        <label className={styles.label}>{t("scheduleTab.appliesToLabel")}</label>
        <select
          className={styles.select}
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          {available.map((g) => (
            <option key={g.id} value={g.id}>
              {t("scheduleTab.groupOnlyOption", {
                label: g.label || t("groupFallbackLabel", { index: g.index }),
              })}
            </option>
          ))}
        </select>
      </div>
      <CadenceEditor
        questionnaire={questionnaire}
        assignment={undefined}
        disabled={false}
        onSave={async (cadence) => {
          await onAdd(groupId, cadence);
          setShow(false);
        }}
      />
    </div>
  );
}

/** Month-grid calendar highlighting days with scheduled questionnaires. */
function ScheduleCalendar({
  entries,
  endDate,
  onDayClick,
  selectedDate,
}: {
  entries: CalendarEntry[];
  endDate?: string | null;
  onDayClick?: (dateStr: string) => void;
  selectedDate?: string | null;
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
          const isSelected = !!selectedDate && dateStr === selectedDate;
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
                background: isSelected
                  ? "var(--color-primary)"
                  : isPastEnd
                    ? "var(--color-surface-muted, #f3f4f6)"
                    : items
                      ? "#eef2ff"
                      : "transparent",
                outline: isSelected
                  ? "2px solid var(--color-primary)"
                  : isToday
                    ? "2px solid var(--color-primary)"
                    : "none",
                opacity: isPastEnd ? 0.5 : 1,
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  color: isSelected ? "#fff" : isEndDate ? "#dc2626" : "var(--color-text-muted)",
                  fontWeight: isSelected || isEndDate ? 700 : 400,
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

// ── Cue config tab ────────────────────────────────────────────────────────────

function CueConfigTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");

  const [groupStates, setGroupStates] = useState<
    Record<
      string,
      CueConfig & {
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
          maxHabits: g.cueConfig?.maxHabits ?? null,
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
          maxHabits: s.maxHabits,
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

  return (
    <div>
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
                maxHabits: s.maxHabits,
              }}
              onChange={(patch) => update(g.id, patch)}
              showMaxHabits
            />
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

// ── Habit creation tab ──────────────────────────────────────────────────────────

type HabitCreationValue = {
  enabled: boolean;
  entryMode: "freeText" | "structured";
  structuredActivityKeys: string[];
};

type HabitCreationSection = "recommender" | "onboarding" | "habitCreation";

function isBoolEnabled(
  scope: "study" | "group",
  studyValue: boolean,
  groupValues: Record<string, boolean>,
  groups: StudySummary["groups"]
): boolean {
  return scope === "study" ? studyValue : groups.some((g) => groupValues[g.id]);
}

function summarizeBool(
  t: ReturnType<typeof useTranslations>,
  scope: "study" | "group",
  studyValue: boolean,
  groupValues: Record<string, boolean>,
  groups: StudySummary["groups"]
): string {
  if (scope === "study")
    return studyValue ? t("habitCreationTab.summaryOn") : t("habitCreationTab.summaryOff");
  const on = groups.filter((g) => groupValues[g.id]).length;
  return t("habitCreationTab.summaryPerGroup", { on, total: groups.length });
}

function isHabitCreationActive(
  scope: "study" | "group",
  studyValue: HabitCreationValue,
  groupValues: Record<string, HabitCreationValue>,
  groups: StudySummary["groups"]
): boolean {
  return scope === "study" ? studyValue.enabled : groups.some((g) => groupValues[g.id]?.enabled);
}

function summarizeHabitCreationEnabled(
  t: ReturnType<typeof useTranslations>,
  scope: "study" | "group",
  studyValue: HabitCreationValue,
  groupValues: Record<string, HabitCreationValue>,
  groups: StudySummary["groups"]
): string {
  if (scope === "study")
    return studyValue.enabled ? t("habitCreationTab.summaryOn") : t("habitCreationTab.summaryOff");
  const on = groups.filter((g) => groupValues[g.id]?.enabled).length;
  return t("habitCreationTab.summaryPerGroup", { on, total: groups.length });
}

/**
 * The entry-mode overview card only reflects instances where habit creation
 * is actually enabled — a group/study with creation off has no meaningful
 * entry mode, regardless of what's stored.
 */
function isEntryModeStructuredActive(
  scope: "study" | "group",
  studyValue: HabitCreationValue,
  groupValues: Record<string, HabitCreationValue>,
  groups: StudySummary["groups"]
): boolean {
  return scope === "study"
    ? studyValue.enabled && studyValue.entryMode === "structured"
    : groups.some(
        (g) => groupValues[g.id]?.enabled && groupValues[g.id]?.entryMode === "structured"
      );
}

function summarizeEntryMode(
  t: ReturnType<typeof useTranslations>,
  scope: "study" | "group",
  studyValue: HabitCreationValue,
  groupValues: Record<string, HabitCreationValue>,
  groups: StudySummary["groups"]
): string {
  if (scope === "study") {
    if (!studyValue.enabled) return t("habitCreationTab.entryModeNaLabel");
    return studyValue.entryMode === "structured"
      ? t("habitCreationTab.entryModeStructuredLabel", {
          count: studyValue.structuredActivityKeys.length,
        })
      : t("habitCreationTab.entryModeFreeTextLabel");
  }
  const enabledGroups = groups.filter((g) => groupValues[g.id]?.enabled);
  if (enabledGroups.length === 0) return t("habitCreationTab.entryModeNaLabel");
  const structured = enabledGroups.filter(
    (g) => groupValues[g.id]?.entryMode === "structured"
  ).length;
  return t("habitCreationTab.entryModeSummaryPerGroup", {
    on: structured,
    total: enabledGroups.length,
  });
}

/**
 * Recommender, onboarding, and habit-creation (+ nested entry mode) — each
 * independently switchable between study-wide and per-group, same shape as
 * RemindersTab below. Entry mode is nested inside the habit-creation section
 * (rather than being its own scoped section) so a group/study instance can
 * never show "structured" while creation is off for that same instance; it
 * still gets its own overview card for at-a-glance visibility.
 */
function HabitCreationTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const { activityTypes } = useActivityTypes(token);

  const [recommenderScope, setRecommenderScope] = useState<"study" | "group">(() =>
    study.groups.some((g) => g.recommenderEnabled != null) ? "group" : "study"
  );
  const [onboardingScope, setOnboardingScope] = useState<"study" | "group">(() =>
    study.groups.some((g) => g.onboardingEnabled != null) ? "group" : "study"
  );
  const [habitCreationScope, setHabitCreationScope] = useState<"study" | "group">(() =>
    study.groups.some((g) => g.selfHabitCreationEnabled != null || g.habitEntryMode != null)
      ? "group"
      : "study"
  );

  const [studyRecommenderEnabled, setStudyRecommenderEnabled] = useState(study.recommenderEnabled);
  const [studyOnboardingEnabled, setStudyOnboardingEnabled] = useState(study.onboardingEnabled);
  const [studyHabitCreation, setStudyHabitCreation] = useState<HabitCreationValue>({
    enabled: study.selfHabitCreationEnabled,
    entryMode: study.habitEntryMode,
    structuredActivityKeys: study.structuredActivityKeys,
  });

  const [groupRecommenderEnabled, setGroupRecommenderEnabled] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        study.groups.map((g) => [g.id, g.recommenderEnabled ?? study.recommenderEnabled])
      )
  );
  const [groupOnboardingEnabled, setGroupOnboardingEnabled] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        study.groups.map((g) => [g.id, g.onboardingEnabled ?? study.onboardingEnabled])
      )
  );
  const [groupHabitCreation, setGroupHabitCreation] = useState<Record<string, HabitCreationValue>>(
    () =>
      Object.fromEntries(
        study.groups.map((g) => [
          g.id,
          {
            enabled: g.selfHabitCreationEnabled ?? study.selfHabitCreationEnabled,
            entryMode: g.habitEntryMode ?? study.habitEntryMode,
            structuredActivityKeys: g.structuredActivityKeys ?? study.structuredActivityKeys,
          },
        ])
      )
  );

  const [saving, setSaving] = useState<Record<HabitCreationSection, boolean>>({
    recommender: false,
    onboarding: false,
    habitCreation: false,
  });
  const [saved, setSaved] = useState<Record<HabitCreationSection, boolean>>({
    recommender: false,
    onboarding: false,
    habitCreation: false,
  });
  const [errors, setErrors] = useState<Record<HabitCreationSection, string>>({
    recommender: "",
    onboarding: "",
    habitCreation: "",
  });

  async function handleSaveRecommender() {
    setSaving((p) => ({ ...p, recommender: true }));
    setErrors((p) => ({ ...p, recommender: "" }));
    try {
      if (recommenderScope === "study") {
        await apiFetch(`${API_BASE}/${study.id}`, token, {
          method: "PUT",
          body: JSON.stringify({ recommenderEnabled: studyRecommenderEnabled }),
        });
        await Promise.all(
          study.groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({ recommenderEnabled: null }),
            }).catch(() => {})
          )
        );
      } else {
        await Promise.all(
          study.groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({ recommenderEnabled: groupRecommenderEnabled[g.id] }),
            })
          )
        );
      }
      setSaved((p) => ({ ...p, recommender: true }));
    } catch (err) {
      setErrors((p) => ({
        ...p,
        recommender: err instanceof Error ? err.message : t("saveFailedGeneric"),
      }));
    } finally {
      setSaving((p) => ({ ...p, recommender: false }));
    }
  }

  async function handleSaveOnboarding() {
    setSaving((p) => ({ ...p, onboarding: true }));
    setErrors((p) => ({ ...p, onboarding: "" }));
    try {
      if (onboardingScope === "study") {
        await apiFetch(`${API_BASE}/${study.id}`, token, {
          method: "PUT",
          body: JSON.stringify({ onboardingEnabled: studyOnboardingEnabled }),
        });
        await Promise.all(
          study.groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({ onboardingEnabled: null }),
            }).catch(() => {})
          )
        );
      } else {
        await Promise.all(
          study.groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({ onboardingEnabled: groupOnboardingEnabled[g.id] }),
            })
          )
        );
      }
      setSaved((p) => ({ ...p, onboarding: true }));
    } catch (err) {
      setErrors((p) => ({
        ...p,
        onboarding: err instanceof Error ? err.message : t("saveFailedGeneric"),
      }));
    } finally {
      setSaving((p) => ({ ...p, onboarding: false }));
    }
  }

  async function handleSaveHabitCreation() {
    setSaving((p) => ({ ...p, habitCreation: true }));
    setErrors((p) => ({ ...p, habitCreation: "" }));
    try {
      if (habitCreationScope === "study") {
        await apiFetch(`${API_BASE}/${study.id}`, token, {
          method: "PUT",
          body: JSON.stringify({
            selfHabitCreationEnabled: studyHabitCreation.enabled,
            habitEntryMode: studyHabitCreation.entryMode,
            structuredActivityKeys: studyHabitCreation.structuredActivityKeys,
          }),
        });
        await Promise.all(
          study.groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({
                selfHabitCreationEnabled: null,
                habitEntryMode: null,
                structuredActivityKeys: null,
              }),
            }).catch(() => {})
          )
        );
      } else {
        await Promise.all(
          study.groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({
                selfHabitCreationEnabled: groupHabitCreation[g.id].enabled,
                habitEntryMode: groupHabitCreation[g.id].entryMode,
                structuredActivityKeys: groupHabitCreation[g.id].structuredActivityKeys,
              }),
            })
          )
        );
      }
      setSaved((p) => ({ ...p, habitCreation: true }));
    } catch (err) {
      setErrors((p) => ({
        ...p,
        habitCreation: err instanceof Error ? err.message : t("saveFailedGeneric"),
      }));
    } finally {
      setSaving((p) => ({ ...p, habitCreation: false }));
    }
  }

  const showActivityTypesManager =
    habitCreationScope === "study"
      ? studyHabitCreation.enabled && studyHabitCreation.entryMode === "structured"
      : study.groups.some(
          (g) =>
            groupHabitCreation[g.id]?.enabled &&
            groupHabitCreation[g.id]?.entryMode === "structured"
        );

  const overviewCards = [
    {
      key: "recommender",
      title: t("habitCreationTab.recommenderLabel"),
      enabled: isBoolEnabled(
        recommenderScope,
        studyRecommenderEnabled,
        groupRecommenderEnabled,
        study.groups
      ),
      status: summarizeBool(
        t,
        recommenderScope,
        studyRecommenderEnabled,
        groupRecommenderEnabled,
        study.groups
      ),
    },
    {
      key: "onboarding",
      title: t("habitCreationTab.onboardingLabel"),
      enabled: isBoolEnabled(
        onboardingScope,
        studyOnboardingEnabled,
        groupOnboardingEnabled,
        study.groups
      ),
      status: summarizeBool(
        t,
        onboardingScope,
        studyOnboardingEnabled,
        groupOnboardingEnabled,
        study.groups
      ),
    },
    {
      key: "habitCreation",
      title: t("habitCreationTab.habitCreationLabel"),
      enabled: isHabitCreationActive(
        habitCreationScope,
        studyHabitCreation,
        groupHabitCreation,
        study.groups
      ),
      status: summarizeHabitCreationEnabled(
        t,
        habitCreationScope,
        studyHabitCreation,
        groupHabitCreation,
        study.groups
      ),
    },
    {
      key: "entryMode",
      title: t("habitCreationTab.entryModeLabel"),
      enabled: isEntryModeStructuredActive(
        habitCreationScope,
        studyHabitCreation,
        groupHabitCreation,
        study.groups
      ),
      status: summarizeEntryMode(
        t,
        habitCreationScope,
        studyHabitCreation,
        groupHabitCreation,
        study.groups
      ),
    },
  ];

  return (
    <div>
      <div className={styles.reminderOverview}>
        {overviewCards.map((card) => (
          <div
            key={card.key}
            className={`${styles.reminderOverviewCard} ${card.enabled ? styles.reminderOverviewCardEnabled : ""}`}
          >
            <span className={styles.reminderOverviewTitle}>{card.title}</span>
            <span className={styles.reminderOverviewStatus}>{card.status}</span>
          </div>
        ))}
      </div>

      <div className={styles.reminderTypeSection} data-testid="habit-creation-section-recommender">
        <p className={styles.cueConfigGroupLabel}>{t("habitCreationTab.recommenderLabel")}</p>
        <span className={styles.hint}>{t("habitCreationTab.recommenderHint")}</span>
        {errors.recommender && <div className={styles.errorMsg}>{errors.recommender}</div>}

        {recommenderScope === "study" ? (
          <ToggleSwitch
            className={styles.checkboxLabel}
            checked={studyRecommenderEnabled}
            onChange={(e) => setStudyRecommenderEnabled(e.target.checked)}
            label={t("habitCreationTab.recommenderEnabledLabel")}
          />
        ) : (
          <div className={styles.reminderGroupList}>
            {study.groups.map((g) => (
              <div key={g.id} className={styles.reminderGroupRow}>
                <p className={styles.cueConfigGroupLabel}>
                  {g.label || t("groupFallbackLabel", { index: g.index })}
                </p>
                <ToggleSwitch
                  className={styles.checkboxLabel}
                  checked={groupRecommenderEnabled[g.id]}
                  onChange={(e) =>
                    setGroupRecommenderEnabled((p) => ({ ...p, [g.id]: e.target.checked }))
                  }
                  label={t("habitCreationTab.recommenderEnabledLabel")}
                />
              </div>
            ))}
          </div>
        )}
        <ToggleSwitch
          className={styles.checkboxLabel}
          checked={recommenderScope === "group"}
          disabled={study.groups.length === 0}
          onChange={(e) => setRecommenderScope(e.target.checked ? "group" : "study")}
          label={t("habitCreationTab.perGroupLabel")}
        />
        {study.groups.length === 0 && (
          <span className={styles.hint}>{t("cueConfigTab.noGroups")}</span>
        )}

        <div className={styles.cueConfigFooter}>
          {saved.recommender && <span className={styles.savedMsg}>{t("saved")}</span>}
          <button
            className={styles.saveBtn}
            onClick={handleSaveRecommender}
            disabled={saving.recommender}
          >
            {saving.recommender ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>

      <div className={styles.reminderTypeSection} data-testid="habit-creation-section-onboarding">
        <p className={styles.cueConfigGroupLabel}>{t("habitCreationTab.onboardingLabel")}</p>
        <span className={styles.hint}>{t("habitCreationTab.onboardingHint")}</span>
        {errors.onboarding && <div className={styles.errorMsg}>{errors.onboarding}</div>}

        {onboardingScope === "study" ? (
          <ToggleSwitch
            className={styles.checkboxLabel}
            checked={studyOnboardingEnabled}
            onChange={(e) => setStudyOnboardingEnabled(e.target.checked)}
            label={t("habitCreationTab.onboardingEnabledLabel")}
          />
        ) : (
          <div className={styles.reminderGroupList}>
            {study.groups.map((g) => (
              <div key={g.id} className={styles.reminderGroupRow}>
                <p className={styles.cueConfigGroupLabel}>
                  {g.label || t("groupFallbackLabel", { index: g.index })}
                </p>
                <ToggleSwitch
                  className={styles.checkboxLabel}
                  checked={groupOnboardingEnabled[g.id]}
                  onChange={(e) =>
                    setGroupOnboardingEnabled((p) => ({ ...p, [g.id]: e.target.checked }))
                  }
                  label={t("habitCreationTab.onboardingEnabledLabel")}
                />
              </div>
            ))}
          </div>
        )}
        <ToggleSwitch
          className={styles.checkboxLabel}
          checked={onboardingScope === "group"}
          disabled={study.groups.length === 0}
          onChange={(e) => setOnboardingScope(e.target.checked ? "group" : "study")}
          label={t("habitCreationTab.perGroupLabel")}
        />
        {study.groups.length === 0 && (
          <span className={styles.hint}>{t("cueConfigTab.noGroups")}</span>
        )}

        <div className={styles.cueConfigFooter}>
          {saved.onboarding && <span className={styles.savedMsg}>{t("saved")}</span>}
          <button
            className={styles.saveBtn}
            onClick={handleSaveOnboarding}
            disabled={saving.onboarding}
          >
            {saving.onboarding ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>

      <div
        className={styles.reminderTypeSection}
        data-testid="habit-creation-section-habitCreation"
      >
        <p className={styles.cueConfigGroupLabel}>{t("habitCreationTab.habitCreationLabel")}</p>
        <span className={styles.hint}>{t("habitCreationTab.habitCreationHint")}</span>
        {errors.habitCreation && <div className={styles.errorMsg}>{errors.habitCreation}</div>}

        {habitCreationScope === "study" ? (
          <div className={styles.reminderSwitchGroup}>
            <ToggleSwitch
              className={styles.checkboxLabel}
              checked={studyHabitCreation.enabled}
              onChange={(e) => setStudyHabitCreation((v) => ({ ...v, enabled: e.target.checked }))}
              label={t("habitCreationTab.habitCreationEnabledLabel")}
            />
            {studyHabitCreation.enabled && (
              <HabitEntryModeForm
                value={{
                  habitEntryMode: studyHabitCreation.entryMode,
                  structuredActivityKeys: studyHabitCreation.structuredActivityKeys,
                }}
                onChange={(patch) =>
                  setStudyHabitCreation((v) => ({
                    ...v,
                    entryMode: patch.habitEntryMode ?? v.entryMode,
                    structuredActivityKeys:
                      patch.structuredActivityKeys ?? v.structuredActivityKeys,
                  }))
                }
                activityTypes={activityTypes}
              />
            )}
          </div>
        ) : (
          <div className={styles.reminderGroupList}>
            {study.groups.map((g) => {
              const v = groupHabitCreation[g.id];
              if (!v) return null;
              return (
                <div key={g.id} className={styles.reminderGroupRow}>
                  <p className={styles.cueConfigGroupLabel}>
                    {g.label || t("groupFallbackLabel", { index: g.index })}
                  </p>
                  <div className={styles.reminderSwitchGroup}>
                    <ToggleSwitch
                      className={styles.checkboxLabel}
                      checked={v.enabled}
                      onChange={(e) =>
                        setGroupHabitCreation((p) => ({
                          ...p,
                          [g.id]: { ...p[g.id], enabled: e.target.checked },
                        }))
                      }
                      label={t("habitCreationTab.habitCreationEnabledLabel")}
                    />
                    {v.enabled && (
                      <HabitEntryModeForm
                        value={{
                          habitEntryMode: v.entryMode,
                          structuredActivityKeys: v.structuredActivityKeys,
                        }}
                        onChange={(patch) =>
                          setGroupHabitCreation((p) => ({
                            ...p,
                            [g.id]: {
                              ...p[g.id],
                              entryMode: patch.habitEntryMode ?? p[g.id].entryMode,
                              structuredActivityKeys:
                                patch.structuredActivityKeys ?? p[g.id].structuredActivityKeys,
                            },
                          }))
                        }
                        activityTypes={activityTypes}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <ToggleSwitch
          className={styles.checkboxLabel}
          checked={habitCreationScope === "group"}
          disabled={study.groups.length === 0}
          onChange={(e) => setHabitCreationScope(e.target.checked ? "group" : "study")}
          label={t("habitCreationTab.perGroupLabel")}
        />
        {study.groups.length === 0 && (
          <span className={styles.hint}>{t("cueConfigTab.noGroups")}</span>
        )}

        {showActivityTypesManager && <ActivityTypesManager token={token} />}

        <div className={styles.cueConfigFooter}>
          {saved.habitCreation && <span className={styles.savedMsg}>{t("saved")}</span>}
          <button
            className={styles.saveBtn}
            onClick={handleSaveHabitCreation}
            disabled={saving.habitCreation}
          >
            {saving.habitCreation ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reminders tab ─────────────────────────────────────────────────────────────

const REMINDER_TYPES = ["habit", "questionnaire", "endOfStudy", "studyUpdate"] as const;
type ReminderType = (typeof REMINDER_TYPES)[number];
type ReminderScope = "study" | "group";

function emptyReminderMode(): ReminderModeValue {
  return { mode: "off", time: null };
}

/**
 * The next occurrence of "HH:MM" (today if still upcoming, else tomorrow),
 * as an ISO string — used to anchor a new recurring campaign's first send.
 * Subsequent sends advance by whole days, so this initial time-of-day
 * persists across the recurrence.
 */
function nextOccurrenceIso(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const candidate = new Date();
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate.getTime() <= Date.now()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

/**
 * Habit reminder's 3-state control: off / participant picks / admin fixes.
 * Two cascading switches — habit is the only type with a real
 * participant-facing picker, so it's the only one that needs a middle state.
 */
function HabitReminderSwitches({
  value,
  onChange,
}: {
  value: ReminderModeValue;
  onChange: (v: ReminderModeValue) => void;
}) {
  const t = useTranslations("studies");
  const enabled = value.mode !== "off";
  const fixed = value.mode === "admin_fixed";
  return (
    <div className={styles.reminderSwitchGroup}>
      <ToggleSwitch
        className={styles.checkboxLabel}
        checked={enabled}
        onChange={(e) =>
          onChange(
            e.target.checked
              ? { mode: "participant_choice", time: null }
              : { mode: "off", time: null }
          )
        }
        label={t("remindersTab.enabledLabel")}
      />
      {enabled && (
        <>
          <ToggleSwitch
            className={styles.checkboxLabel}
            checked={fixed}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { mode: "admin_fixed", time: value.time ?? "09:00" }
                  : { mode: "participant_choice", time: null }
              )
            }
            label={t("remindersTab.adminFixesTimeLabel")}
          />
          {fixed && (
            <input
              type="time"
              className={styles.input}
              value={value.time ?? "09:00"}
              onChange={(e) => onChange({ mode: "admin_fixed", time: e.target.value })}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Questionnaire / end-of-study / study-update's 2-state control: set a time,
 * or don't. No participant-facing override exists for these types.
 */
function SetTimeSwitch({
  value,
  onChange,
}: {
  value: ReminderModeValue;
  onChange: (v: ReminderModeValue) => void;
}) {
  const t = useTranslations("studies");
  const on = value.mode === "admin_fixed";
  return (
    <div className={styles.reminderSwitchGroup}>
      <ToggleSwitch
        className={styles.checkboxLabel}
        checked={on}
        onChange={(e) =>
          onChange(
            e.target.checked
              ? { mode: "admin_fixed", time: value.time ?? "09:00" }
              : { mode: "off", time: null }
          )
        }
        label={t("remindersTab.setTimeLabel")}
      />
      {on && (
        <input
          type="time"
          className={styles.input}
          value={value.time ?? "09:00"}
          onChange={(e) => onChange({ mode: "admin_fixed", time: e.target.value })}
        />
      )}
    </div>
  );
}

/** One reminder type's one-line status, for the overview strip. */
function summarizeReminder(
  t: ReturnType<typeof useTranslations>,
  scope: ReminderScope,
  studyValue: ReminderModeValue,
  groupValues: Record<string, ReminderModeValue>,
  groups: StudySummary["groups"]
): string {
  if (scope === "study") {
    if (studyValue.mode === "off") return t("remindersTab.summaryOff");
    if (studyValue.mode === "participant_choice") return t("remindersTab.summaryParticipantChoice");
    return t("remindersTab.summaryFixed", { time: studyValue.time ?? "" });
  }
  const onCount = groups.filter((g) => groupValues[g.id]?.mode !== "off").length;
  return t("remindersTab.summaryPerGroup", { on: onCount, total: groups.length });
}

function isReminderEnabled(
  scope: ReminderScope,
  studyValue: ReminderModeValue,
  groupValues: Record<string, ReminderModeValue>,
  groups: StudySummary["groups"]
): boolean {
  if (scope === "study") return studyValue.mode !== "off";
  return groups.some((g) => groupValues[g.id]?.mode !== "off");
}

/**
 * The study-wide or per-group settings block(s), followed by the scope
 * switch ("Configure per group") that chooses between them. Purely
 * presentational/state-lifted — the caller owns all the values and save
 * logic.
 */
function ScopedReminderEditor({
  scope,
  onScopeChange,
  studyValue,
  onStudyValueChange,
  groupValues,
  onGroupValueChange,
  groups,
  switches: Switches,
}: {
  scope: ReminderScope;
  onScopeChange: (s: ReminderScope) => void;
  studyValue: ReminderModeValue;
  onStudyValueChange: (v: ReminderModeValue) => void;
  groupValues: Record<string, ReminderModeValue>;
  onGroupValueChange: (groupId: string, v: ReminderModeValue) => void;
  groups: StudySummary["groups"];
  switches: React.ComponentType<{
    value: ReminderModeValue;
    onChange: (v: ReminderModeValue) => void;
  }>;
}) {
  const t = useTranslations("studies");
  return (
    <div>
      {scope === "study" ? (
        <Switches value={studyValue} onChange={onStudyValueChange} />
      ) : (
        <div className={styles.reminderGroupList}>
          {groups.map((g) => (
            <div key={g.id} className={styles.reminderGroupRow}>
              <p className={styles.cueConfigGroupLabel}>
                {g.label || t("groupFallbackLabel", { index: g.index })}
              </p>
              <Switches
                value={groupValues[g.id] ?? emptyReminderMode()}
                onChange={(v) => onGroupValueChange(g.id, v)}
              />
            </div>
          ))}
        </div>
      )}
      <ToggleSwitch
        className={styles.checkboxLabel}
        checked={scope === "group"}
        disabled={groups.length === 0}
        onChange={(e) => onScopeChange(e.target.checked ? "group" : "study")}
        label={t("remindersTab.perGroupLabel")}
      />
      {groups.length === 0 && <span className={styles.hint}>{t("cueConfigTab.noGroups")}</span>}
    </div>
  );
}

function RemindersTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");

  // Scope defaults to "group" for any type that already has at least one
  // group-level override stored — otherwise "study".
  const [scope, setScope] = useState<Record<ReminderType, ReminderScope>>(
    () =>
      Object.fromEntries(
        REMINDER_TYPES.map((type) => [
          type,
          study.groups.some((g) => g.reminders?.[type] != null) ? "group" : "study",
        ])
      ) as Record<ReminderType, ReminderScope>
  );

  const [studyReminders, setStudyReminders] = useState<RemindersConfig>(
    () =>
      study.reminders ?? {
        habit: emptyReminderMode(),
        questionnaire: emptyReminderMode(),
        endOfStudy: emptyReminderMode(),
        studyUpdate: emptyReminderMode(),
      }
  );

  // Per-group values are always concrete once in local state (no null/inherit
  // — that's what study-wide scope is for). Seeded from the group's stored
  // override, falling back to the study-level value as a sensible starting
  // point when a group has no override yet.
  const [groupReminders, setGroupReminders] = useState<
    Record<string, Record<ReminderType, ReminderModeValue>>
  >(() =>
    Object.fromEntries(
      study.groups.map((g) => [
        g.id,
        Object.fromEntries(
          REMINDER_TYPES.map((type) => [
            type,
            g.reminders?.[type] ?? study.reminders?.[type] ?? emptyReminderMode(),
          ])
        ) as Record<ReminderType, ReminderModeValue>,
      ])
    )
  );

  const [endOfStudyTitle, setEndOfStudyTitle] = useState(
    study.endOfStudyNotification?.title ?? "Study complete"
  );
  const [endOfStudyBody, setEndOfStudyBody] = useState(
    study.endOfStudyNotification?.body ?? "Thank you for participating — your study has ended."
  );

  // Study-update is the only reminder type backed by an actual delivery
  // mechanism (recurring notification campaigns) rather than just a value
  // read at the right moment. One campaign per active target — "all" for
  // study-wide scope, or one per group for per-group scope.
  const [studyUpdateIntervalDays, setStudyUpdateIntervalDays] = useState(7);
  const [studyUpdateTitle, setStudyUpdateTitle] = useState("Study update");
  const [studyUpdateBody, setStudyUpdateBody] = useState("Check the app for the latest updates.");
  const [existingCampaigns, setExistingCampaigns] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadExistingCampaigns() {
      try {
        const data = await apiFetch<
          | {
              campaigns?: {
                id: string;
                recurrence?: unknown;
                targetType: string;
                targetIds: string[];
              }[];
            }
          | { id: string; recurrence?: unknown; targetType: string; targetIds: string[] }[]
        >(`${NOTIFICATIONS_BASE}?studyId=${study.id}&status=scheduled`, token);
        const list = Array.isArray(data) ? data : (data.campaigns ?? []);
        const byTarget: Record<string, string> = {};
        for (const c of list) {
          if (!c.recurrence) continue;
          const key = c.targetType === "group" ? (c.targetIds[0] ?? "all") : "all";
          byTarget[key] = c.id;
        }
        if (!cancelled) setExistingCampaigns(byTarget);
      } catch {
        // Non-fatal: the save flow just creates new campaigns if this lookup fails.
      }
    }
    loadExistingCampaigns();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study.id, token]);

  const [saving, setSaving] = useState<Record<ReminderType, boolean>>(
    () =>
      Object.fromEntries(REMINDER_TYPES.map((t2) => [t2, false])) as Record<ReminderType, boolean>
  );
  const [saved, setSaved] = useState<Record<ReminderType, boolean>>(
    () =>
      Object.fromEntries(REMINDER_TYPES.map((t2) => [t2, false])) as Record<ReminderType, boolean>
  );
  const [errors, setErrors] = useState<Record<ReminderType, string>>(
    () => Object.fromEntries(REMINDER_TYPES.map((t2) => [t2, ""])) as Record<ReminderType, string>
  );

  async function syncStudyUpdateCampaigns() {
    // Campaigns have no update endpoint — cancel everything tracked, then
    // recreate exactly what should exist for the current scope/values.
    await Promise.all(
      Object.values(existingCampaigns).map((id) =>
        apiFetch(`${NOTIFICATIONS_BASE}/${id}`, token, { method: "DELETE" }).catch(() => {})
      )
    );
    const targets: {
      key: string;
      value: ReminderModeValue;
      targetType: string;
      targetIds: string[];
    }[] =
      scope.studyUpdate === "study"
        ? [
            {
              key: "all",
              value: studyReminders.studyUpdate,
              targetType: "all_enrolled",
              targetIds: [],
            },
          ]
        : study.groups.map((g) => ({
            key: g.id,
            value: groupReminders[g.id]?.studyUpdate ?? emptyReminderMode(),
            targetType: "group",
            targetIds: [g.id],
          }));

    const newCampaigns: Record<string, string> = {};
    for (const target of targets) {
      if (target.value.mode !== "admin_fixed") continue;
      const created = await apiFetch<{ id: string }>(NOTIFICATIONS_BASE, token, {
        method: "POST",
        body: JSON.stringify({
          studyId: study.id,
          title: studyUpdateTitle.trim() || "Study update",
          body: studyUpdateBody.trim() || "Check the app for the latest updates.",
          targetType: target.targetType,
          targetIds: target.targetIds,
          scheduledFor: nextOccurrenceIso(target.value.time ?? "09:00"),
          recurrence: { intervalDays: studyUpdateIntervalDays },
        }),
      });
      newCampaigns[target.key] = created.id;
    }
    setExistingCampaigns(newCampaigns);
  }

  async function handleSaveType(type: ReminderType) {
    setSaving((prev) => ({ ...prev, [type]: true }));
    setErrors((prev) => ({ ...prev, [type]: "" }));
    try {
      if (scope[type] === "study") {
        await apiFetch(`${API_BASE}/${study.id}`, token, {
          method: "PUT",
          body: JSON.stringify({
            reminders: { [type]: studyReminders[type] },
            ...(type === "endOfStudy"
              ? {
                  endOfStudyNotification: {
                    title: endOfStudyTitle.trim() || "Study complete",
                    body:
                      endOfStudyBody.trim() ||
                      "Thank you for participating — your study has ended.",
                  },
                }
              : {}),
          }),
        });
        // Study-wide is the single source of truth once selected — clear any
        // lingering per-group overrides for this type so they actually inherit.
        await Promise.all(
          study.groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({ reminders: { [type]: null } }),
            }).catch(() => {})
          )
        );
      } else {
        await Promise.all(
          study.groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({ reminders: { [type]: groupReminders[g.id][type] } }),
            })
          )
        );
        if (type === "endOfStudy") {
          await apiFetch(`${API_BASE}/${study.id}`, token, {
            method: "PUT",
            body: JSON.stringify({
              endOfStudyNotification: {
                title: endOfStudyTitle.trim() || "Study complete",
                body:
                  endOfStudyBody.trim() || "Thank you for participating — your study has ended.",
              },
            }),
          });
        }
      }

      if (type === "studyUpdate") {
        await syncStudyUpdateCampaigns();
      }

      setSaved((prev) => ({ ...prev, [type]: true }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [type]: err instanceof Error ? err.message : t("saveFailedGeneric"),
      }));
    } finally {
      setSaving((prev) => ({ ...prev, [type]: false }));
    }
  }

  function updateStudyValue(type: ReminderType, v: ReminderModeValue) {
    setStudyReminders((prev) => ({ ...prev, [type]: v }));
    setSaved((prev) => ({ ...prev, [type]: false }));
  }

  function updateGroupValue(type: ReminderType, groupId: string, v: ReminderModeValue) {
    setGroupReminders((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], [type]: v },
    }));
    setSaved((prev) => ({ ...prev, [type]: false }));
  }

  const groupValuesFor = (type: ReminderType) =>
    Object.fromEntries(study.groups.map((g) => [g.id, groupReminders[g.id]?.[type]]));

  return (
    <div>
      {/* Overview: at-a-glance status for all 4 types before diving into details. */}
      <div className={styles.reminderOverview}>
        {REMINDER_TYPES.map((type) => {
          const enabled = isReminderEnabled(
            scope[type],
            studyReminders[type],
            groupValuesFor(type) as Record<string, ReminderModeValue>,
            study.groups
          );
          return (
            <div
              key={type}
              className={`${styles.reminderOverviewCard} ${enabled ? styles.reminderOverviewCardEnabled : ""}`}
            >
              <span className={styles.reminderOverviewTitle}>{t(`remindersTab.${type}Label`)}</span>
              <span className={styles.reminderOverviewStatus}>
                {summarizeReminder(
                  t,
                  scope[type],
                  studyReminders[type],
                  groupValuesFor(type) as Record<string, ReminderModeValue>,
                  study.groups
                )}
              </span>
            </div>
          );
        })}
      </div>

      {REMINDER_TYPES.map((type) => (
        <div
          key={type}
          className={styles.reminderTypeSection}
          data-testid={`reminder-section-${type}`}
        >
          <p className={styles.cueConfigGroupLabel}>{t(`remindersTab.${type}Label`)}</p>
          <span className={styles.hint}>{t(`remindersTab.${type}Hint`)}</span>
          {errors[type] && <div className={styles.errorMsg}>{errors[type]}</div>}

          <ScopedReminderEditor
            scope={scope[type]}
            onScopeChange={(s) => {
              setScope((prev) => ({ ...prev, [type]: s }));
              setSaved((prev) => ({ ...prev, [type]: false }));
            }}
            studyValue={studyReminders[type]}
            onStudyValueChange={(v) => updateStudyValue(type, v)}
            groupValues={groupValuesFor(type) as Record<string, ReminderModeValue>}
            onGroupValueChange={(groupId, v) => updateGroupValue(type, groupId, v)}
            groups={study.groups}
            switches={type === "habit" ? HabitReminderSwitches : SetTimeSwitch}
          />

          {type === "endOfStudy" &&
            (scope.endOfStudy === "study"
              ? studyReminders.endOfStudy.mode === "admin_fixed"
              : study.groups.some(
                  (g) => groupReminders[g.id]?.endOfStudy?.mode === "admin_fixed"
                )) && (
              <div className={`${styles.formGroup} ${styles.formFull}`}>
                <label className={styles.label}>{t("modal.fields.notificationTitleLabel")}</label>
                <input
                  className={styles.input}
                  value={endOfStudyTitle}
                  onChange={(e) => setEndOfStudyTitle(e.target.value)}
                  maxLength={120}
                />
                <label className={styles.label}>{t("modal.fields.notificationBodyLabel")}</label>
                <input
                  className={styles.input}
                  value={endOfStudyBody}
                  onChange={(e) => setEndOfStudyBody(e.target.value)}
                  maxLength={500}
                />
              </div>
            )}

          {type === "studyUpdate" &&
            (scope.studyUpdate === "study"
              ? studyReminders.studyUpdate.mode === "admin_fixed"
              : study.groups.some(
                  (g) => groupReminders[g.id]?.studyUpdate?.mode === "admin_fixed"
                )) && (
              <div className={`${styles.formGroup} ${styles.formFull}`}>
                <label className={styles.label}>{t("remindersTab.intervalDaysLabel")}</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className={styles.input}
                  value={studyUpdateIntervalDays}
                  onChange={(e) =>
                    setStudyUpdateIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                />
                <label className={styles.label}>{t("modal.fields.notificationTitleLabel")}</label>
                <input
                  className={styles.input}
                  value={studyUpdateTitle}
                  onChange={(e) => setStudyUpdateTitle(e.target.value)}
                  maxLength={65}
                />
                <label className={styles.label}>{t("modal.fields.notificationBodyLabel")}</label>
                <input
                  className={styles.input}
                  value={studyUpdateBody}
                  onChange={(e) => setStudyUpdateBody(e.target.value)}
                  maxLength={240}
                />
              </div>
            )}

          <div className={styles.cueConfigFooter}>
            {saved[type] && <span className={styles.savedMsg}>{t("saved")}</span>}
            <button
              className={styles.saveBtn}
              onClick={() => handleSaveType(type)}
              disabled={saving[type]}
            >
              {saving[type] ? tc("saving") : tc("save")}
            </button>
          </div>

          {type === "studyUpdate" && <StudyUpdateManualSend study={study} token={token} />}
        </div>
      ))}
    </div>
  );
}

/**
 * One-off / scheduled-once manual sends + campaign history — merged in from
 * the former standalone Notifications tab. Kept as an independent composer
 * (its own individual/group/all target selector) rather than routed through
 * the scoped-reminder model above, since "send this one specific message to
 * whoever I pick right now" is a different targeting concept than a
 * recurring, scope-bound reminder.
 */
function StudyUpdateManualSend({ study, token }: { study: StudySummary; token: string }) {
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
        const r = result as {
          recipientCount?: number;
          resolvedUserCount?: number;
          tokenCount?: number;
        };
        const count = r.recipientCount ?? 0;
        if (count > 0) {
          showToast(t("notificationsTab.sentToCount", { count }));
        } else if ((r.resolvedUserCount ?? 0) === 0) {
          // Reached nobody — explain why so the researcher can act, instead of
          // a bare "Sent to 0".
          showToast(t("notificationsTab.reachedNoneNoEnrollment"));
        } else if ((r.tokenCount ?? 0) === 0) {
          showToast(
            t("notificationsTab.reachedNoneNoDevices", {
              count: r.resolvedUserCount ?? 0,
            })
          );
        } else {
          showToast(
            t("notificationsTab.reachedNoneAllFailed", {
              count: r.tokenCount ?? 0,
            })
          );
        }
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
      <p className={styles.reminderSubsectionTitle}>{t("notificationsTab.manualSendTitle")}</p>

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

// ── Behavior-change tab ───────────────────────────────────────────────────────

type BehaviorSection = "habitStacking" | "reminderContent" | "infoOverload";
type Scope = "study" | "group";

const EMPTY_GUARD: InformationOverloadGuard = {
  enabled: false,
  userOptOutAllowed: false,
};

/**
 * §7.1 Habit Stacking, §7.2 Implementation-Intention reminder copy, and §7.3
 * Information-Overload guard — three independently study-wide-or-per-group
 * sections, same shape and layout as HabitCreationTab. Each section owns its
 * scope switch and Save button; study-scope saves also null out every group
 * override so inheritance is restored.
 */
function BehaviorChangeTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const groups = study.groups;

  // ── Habit stacking (boolean) ────────────────────────────────────────────
  const [stackScope, setStackScope] = useState<Scope>(() =>
    groups.some((g) => g.habitStackingEnabled != null) ? "group" : "study"
  );
  const [studyStack, setStudyStack] = useState(study.habitStackingEnabled);
  const [groupStack, setGroupStack] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.id, g.habitStackingEnabled ?? study.habitStackingEnabled])
    )
  );

  // ── Reminder content mode (boolean: implementation-intention on/off) ─────
  const studyII = study.reminderContentMode === "implementation_intention";
  const [reminderScope, setReminderScope] = useState<Scope>(() =>
    groups.some((g) => g.reminderContentMode != null) ? "group" : "study"
  );
  const [studyReminder, setStudyReminder] = useState(studyII);
  const [groupReminder, setGroupReminder] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((g) => [
        g.id,
        g.reminderContentMode != null
          ? g.reminderContentMode === "implementation_intention"
          : studyII,
      ])
    )
  );

  // ── Information-overload guard ({ enabled, userOptOutAllowed }) ───────────
  const studyGuard = study.informationOverloadGuard ?? EMPTY_GUARD;
  const [guardScope, setGuardScope] = useState<Scope>(() =>
    groups.some((g) => g.informationOverloadGuard != null) ? "group" : "study"
  );
  const [studyOverload, setStudyOverload] = useState<InformationOverloadGuard>(studyGuard);
  const [groupOverload, setGroupOverload] = useState<Record<string, InformationOverloadGuard>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.informationOverloadGuard ?? studyGuard]))
  );

  const [saving, setSaving] = useState<Record<BehaviorSection, boolean>>({
    habitStacking: false,
    reminderContent: false,
    infoOverload: false,
  });
  const [saved, setSaved] = useState<Record<BehaviorSection, boolean>>({
    habitStacking: false,
    reminderContent: false,
    infoOverload: false,
  });
  const [errors, setErrors] = useState<Record<BehaviorSection, string>>({
    habitStacking: "",
    reminderContent: "",
    infoOverload: "",
  });

  function putStudy(body: object) {
    return apiFetch(`${API_BASE}/${study.id}`, token, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  function patchGroup(groupId: string, body: object) {
    return apiFetch(`${API_BASE}/${study.id}/groups/${groupId}/config`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async function runSave(section: BehaviorSection, fn: () => Promise<void>) {
    setSaving((p) => ({ ...p, [section]: true }));
    setErrors((p) => ({ ...p, [section]: "" }));
    try {
      await fn();
      setSaved((p) => ({ ...p, [section]: true }));
    } catch (err) {
      setErrors((p) => ({
        ...p,
        [section]: err instanceof Error ? err.message : t("saveFailedGeneric"),
      }));
    } finally {
      setSaving((p) => ({ ...p, [section]: false }));
    }
  }

  const saveHabitStacking = () =>
    runSave("habitStacking", async () => {
      if (stackScope === "study") {
        await putStudy({ habitStackingEnabled: studyStack });
        await Promise.all(
          groups.map((g) => patchGroup(g.id, { habitStackingEnabled: null }).catch(() => {}))
        );
      } else {
        await Promise.all(
          groups.map((g) => patchGroup(g.id, { habitStackingEnabled: groupStack[g.id] }))
        );
      }
    });

  const saveReminderContent = () =>
    runSave("reminderContent", async () => {
      const toMode = (b: boolean) => (b ? "implementation_intention" : "generic");
      if (reminderScope === "study") {
        await putStudy({ reminderContentMode: toMode(studyReminder) });
        await Promise.all(
          groups.map((g) => patchGroup(g.id, { reminderContentMode: null }).catch(() => {}))
        );
      } else {
        await Promise.all(
          groups.map((g) => patchGroup(g.id, { reminderContentMode: toMode(groupReminder[g.id]) }))
        );
      }
    });

  const saveInfoOverload = () =>
    runSave("infoOverload", async () => {
      if (guardScope === "study") {
        await putStudy({ informationOverloadGuard: studyOverload });
        await Promise.all(
          groups.map((g) => patchGroup(g.id, { informationOverloadGuard: null }).catch(() => {}))
        );
      } else {
        await Promise.all(
          groups.map((g) => patchGroup(g.id, { informationOverloadGuard: groupOverload[g.id] }))
        );
      }
    });

  // ── Overview strip ───────────────────────────────────────────────────────
  const summarizeBoolScope = (scope: Scope, sv: boolean, gv: Record<string, boolean>) => {
    if (scope === "study")
      return sv ? t("behaviorChangeTab.summaryOn") : t("behaviorChangeTab.summaryOff");
    const on = groups.filter((g) => gv[g.id]).length;
    return t("behaviorChangeTab.summaryPerGroup", { on, total: groups.length });
  };
  const boolActive = (scope: Scope, sv: boolean, gv: Record<string, boolean>) =>
    scope === "study" ? sv : groups.some((g) => gv[g.id]);

  const overviewCards = [
    {
      key: "habitStacking",
      title: t("behaviorChangeTab.habitStackingLabel"),
      enabled: boolActive(stackScope, studyStack, groupStack),
      status: summarizeBoolScope(stackScope, studyStack, groupStack),
    },
    {
      key: "reminderContent",
      title: t("behaviorChangeTab.reminderContentLabel"),
      enabled: boolActive(reminderScope, studyReminder, groupReminder),
      status: summarizeBoolScope(reminderScope, studyReminder, groupReminder),
    },
    {
      key: "infoOverload",
      title: t("behaviorChangeTab.infoOverloadLabel"),
      enabled:
        guardScope === "study"
          ? studyOverload.enabled
          : groups.some((g) => groupOverload[g.id]?.enabled),
      status:
        guardScope === "study"
          ? studyOverload.enabled
            ? t("behaviorChangeTab.summaryOn")
            : t("behaviorChangeTab.summaryOff")
          : t("behaviorChangeTab.summaryPerGroup", {
              on: groups.filter((g) => groupOverload[g.id]?.enabled).length,
              total: groups.length,
            }),
    },
  ];

  const perGroupToggle = (scope: Scope, onChange: (s: Scope) => void) => (
    <>
      <ToggleSwitch
        className={styles.checkboxLabel}
        checked={scope === "group"}
        disabled={groups.length === 0}
        onChange={(e) => onChange(e.target.checked ? "group" : "study")}
        label={t("behaviorChangeTab.perGroupLabel")}
      />
      {groups.length === 0 && <span className={styles.hint}>{t("cueConfigTab.noGroups")}</span>}
    </>
  );

  const sectionFooter = (section: BehaviorSection, onSave: () => void) => (
    <div className={styles.cueConfigFooter}>
      {saved[section] && <span className={styles.savedMsg}>{t("saved")}</span>}
      <button className={styles.saveBtn} onClick={onSave} disabled={saving[section]}>
        {saving[section] ? tc("saving") : tc("save")}
      </button>
    </div>
  );

  return (
    <div>
      <div className={styles.reminderOverview}>
        {overviewCards.map((card) => (
          <div
            key={card.key}
            className={`${styles.reminderOverviewCard} ${card.enabled ? styles.reminderOverviewCardEnabled : ""}`}
          >
            <span className={styles.reminderOverviewTitle}>{card.title}</span>
            <span className={styles.reminderOverviewStatus}>{card.status}</span>
          </div>
        ))}
      </div>

      {/* Habit stacking */}
      <div className={styles.reminderTypeSection} data-testid="behavior-section-habitStacking">
        <p className={styles.cueConfigGroupLabel}>{t("behaviorChangeTab.habitStackingLabel")}</p>
        <span className={styles.hint}>{t("behaviorChangeTab.habitStackingHint")}</span>
        {errors.habitStacking && <div className={styles.errorMsg}>{errors.habitStacking}</div>}

        {stackScope === "study" ? (
          <ToggleSwitch
            className={styles.checkboxLabel}
            checked={studyStack}
            onChange={(e) => setStudyStack(e.target.checked)}
            label={t("behaviorChangeTab.habitStackingEnabledLabel")}
          />
        ) : (
          <div className={styles.reminderGroupList}>
            {groups.map((g) => (
              <div key={g.id} className={styles.reminderGroupRow}>
                <p className={styles.cueConfigGroupLabel}>
                  {g.label || t("groupFallbackLabel", { index: g.index })}
                </p>
                <ToggleSwitch
                  className={styles.checkboxLabel}
                  checked={groupStack[g.id] ?? false}
                  onChange={(e) => setGroupStack((p) => ({ ...p, [g.id]: e.target.checked }))}
                  label={t("behaviorChangeTab.habitStackingEnabledLabel")}
                />
              </div>
            ))}
          </div>
        )}
        {perGroupToggle(stackScope, setStackScope)}
        {sectionFooter("habitStacking", saveHabitStacking)}
      </div>

      {/* Implementation-intention reminder copy */}
      <div className={styles.reminderTypeSection} data-testid="behavior-section-reminderContent">
        <p className={styles.cueConfigGroupLabel}>{t("behaviorChangeTab.reminderContentLabel")}</p>
        <span className={styles.hint}>{t("behaviorChangeTab.reminderContentHint")}</span>
        {errors.reminderContent && <div className={styles.errorMsg}>{errors.reminderContent}</div>}

        {reminderScope === "study" ? (
          <ToggleSwitch
            className={styles.checkboxLabel}
            checked={studyReminder}
            onChange={(e) => setStudyReminder(e.target.checked)}
            label={t("behaviorChangeTab.reminderContentEnabledLabel")}
          />
        ) : (
          <div className={styles.reminderGroupList}>
            {groups.map((g) => (
              <div key={g.id} className={styles.reminderGroupRow}>
                <p className={styles.cueConfigGroupLabel}>
                  {g.label || t("groupFallbackLabel", { index: g.index })}
                </p>
                <ToggleSwitch
                  className={styles.checkboxLabel}
                  checked={groupReminder[g.id] ?? false}
                  onChange={(e) => setGroupReminder((p) => ({ ...p, [g.id]: e.target.checked }))}
                  label={t("behaviorChangeTab.reminderContentEnabledLabel")}
                />
              </div>
            ))}
          </div>
        )}
        {perGroupToggle(reminderScope, setReminderScope)}
        {sectionFooter("reminderContent", saveReminderContent)}
      </div>

      {/* Information-overload guard */}
      <div className={styles.reminderTypeSection} data-testid="behavior-section-infoOverload">
        <p className={styles.cueConfigGroupLabel}>{t("behaviorChangeTab.infoOverloadLabel")}</p>
        <span className={styles.hint}>{t("behaviorChangeTab.infoOverloadHint")}</span>
        {errors.infoOverload && <div className={styles.errorMsg}>{errors.infoOverload}</div>}

        {guardScope === "study" ? (
          <div className={styles.reminderSwitchGroup}>
            <ToggleSwitch
              className={styles.checkboxLabel}
              checked={studyOverload.enabled}
              onChange={(e) => setStudyOverload((v) => ({ ...v, enabled: e.target.checked }))}
              label={t("behaviorChangeTab.infoOverloadEnabledLabel")}
            />
            {studyOverload.enabled && (
              <ToggleSwitch
                className={styles.checkboxLabel}
                checked={studyOverload.userOptOutAllowed}
                onChange={(e) =>
                  setStudyOverload((v) => ({ ...v, userOptOutAllowed: e.target.checked }))
                }
                label={t("behaviorChangeTab.infoOverloadOptOutLabel")}
              />
            )}
          </div>
        ) : (
          <div className={styles.reminderGroupList}>
            {groups.map((g) => {
              const v = groupOverload[g.id] ?? EMPTY_GUARD;
              return (
                <div key={g.id} className={styles.reminderGroupRow}>
                  <p className={styles.cueConfigGroupLabel}>
                    {g.label || t("groupFallbackLabel", { index: g.index })}
                  </p>
                  <div className={styles.reminderSwitchGroup}>
                    <ToggleSwitch
                      className={styles.checkboxLabel}
                      checked={v.enabled}
                      onChange={(e) =>
                        setGroupOverload((p) => ({
                          ...p,
                          [g.id]: { ...v, enabled: e.target.checked },
                        }))
                      }
                      label={t("behaviorChangeTab.infoOverloadEnabledLabel")}
                    />
                    {v.enabled && (
                      <ToggleSwitch
                        className={styles.checkboxLabel}
                        checked={v.userOptOutAllowed}
                        onChange={(e) =>
                          setGroupOverload((p) => ({
                            ...p,
                            [g.id]: { ...v, userOptOutAllowed: e.target.checked },
                          }))
                        }
                        label={t("behaviorChangeTab.infoOverloadOptOutLabel")}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {perGroupToggle(guardScope, setGuardScope)}
        {sectionFooter("infoOverload", saveInfoOverload)}
      </div>
    </div>
  );
}

// ── Gamification tab ──────────────────────────────────────────────────────────

/**
 * §7.5 Gamification — a single study-wide-or-per-group on/off toggle. XP/level
 * tuning stays global (admin_settings). Same scoped layout as the other tabs.
 */
function GamificationTab({ study, token }: { study: StudySummary; token: string }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const groups = study.groups;

  const [scope, setScope] = useState<Scope>(() =>
    groups.some((g) => g.gamificationEnabled != null) ? "group" : "study"
  );
  const [studyEnabled, setStudyEnabled] = useState(study.gamificationEnabled);
  const [groupEnabled, setGroupEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.id, g.gamificationEnabled ?? study.gamificationEnabled])
    )
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (scope === "study") {
        await apiFetch(`${API_BASE}/${study.id}`, token, {
          method: "PUT",
          body: JSON.stringify({ gamificationEnabled: studyEnabled }),
        });
        await Promise.all(
          groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({ gamificationEnabled: null }),
            }).catch(() => {})
          )
        );
      } else {
        await Promise.all(
          groups.map((g) =>
            apiFetch(`${API_BASE}/${study.id}/groups/${g.id}/config`, token, {
              method: "PATCH",
              body: JSON.stringify({ gamificationEnabled: groupEnabled[g.id] }),
            })
          )
        );
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailedGeneric"));
    } finally {
      setSaving(false);
    }
  }

  const active = scope === "study" ? studyEnabled : groups.some((g) => groupEnabled[g.id]);
  const status =
    scope === "study"
      ? studyEnabled
        ? t("gamificationTab.summaryOn")
        : t("gamificationTab.summaryOff")
      : t("gamificationTab.summaryPerGroup", {
          on: groups.filter((g) => groupEnabled[g.id]).length,
          total: groups.length,
        });

  return (
    <div>
      <div className={styles.reminderOverview}>
        <div
          className={`${styles.reminderOverviewCard} ${active ? styles.reminderOverviewCardEnabled : ""}`}
        >
          <span className={styles.reminderOverviewTitle}>{t("gamificationTab.label")}</span>
          <span className={styles.reminderOverviewStatus}>{status}</span>
        </div>
      </div>

      <div className={styles.reminderTypeSection} data-testid="gamification-section">
        <p className={styles.cueConfigGroupLabel}>{t("gamificationTab.label")}</p>
        <span className={styles.hint}>{t("gamificationTab.hint")}</span>
        {error && <div className={styles.errorMsg}>{error}</div>}

        {scope === "study" ? (
          <ToggleSwitch
            className={styles.checkboxLabel}
            checked={studyEnabled}
            onChange={(e) => setStudyEnabled(e.target.checked)}
            label={t("gamificationTab.enabledLabel")}
          />
        ) : (
          <div className={styles.reminderGroupList}>
            {groups.map((g) => (
              <div key={g.id} className={styles.reminderGroupRow}>
                <p className={styles.cueConfigGroupLabel}>
                  {g.label || t("groupFallbackLabel", { index: g.index })}
                </p>
                <ToggleSwitch
                  className={styles.checkboxLabel}
                  checked={groupEnabled[g.id] ?? false}
                  onChange={(e) => setGroupEnabled((p) => ({ ...p, [g.id]: e.target.checked }))}
                  label={t("gamificationTab.enabledLabel")}
                />
              </div>
            ))}
          </div>
        )}
        <ToggleSwitch
          className={styles.checkboxLabel}
          checked={scope === "group"}
          disabled={groups.length === 0}
          onChange={(e) => setScope(e.target.checked ? "group" : "study")}
          label={t("gamificationTab.perGroupLabel")}
        />
        {groups.length === 0 && <span className={styles.hint}>{t("cueConfigTab.noGroups")}</span>}

        <div className={styles.cueConfigFooter}>
          {saved && <span className={styles.savedMsg}>{t("saved")}</span>}
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Study form modal ──────────────────────────────────────────────────────────

type ModalTab =
  | "details"
  | "questionnaires"
  | "codes"
  | "participants"
  | "cue-config"
  | "habit-creation"
  | "reminders"
  | "behavior-change"
  | "gamification";

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
  const [endDate, setEndDate] = useState(initial?.endDate ? initial.endDate.slice(0, 10) : "");
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
            endDate: endDate ? new Date(`${endDate}T00:00:00Z`).toISOString() : null,
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
            groups,
            endDate: endDate ? new Date(`${endDate}T00:00:00Z`).toISOString() : null,
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
              className={`${styles.tab} ${activeTab === "cue-config" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("cue-config")}
            >
              {t("modal.tabs.cueConfig")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "habit-creation" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("habit-creation")}
            >
              {t("modal.tabs.habitCreation")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "reminders" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("reminders")}
            >
              {t("modal.tabs.reminders")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "behavior-change" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("behavior-change")}
            >
              {t("modal.tabs.behaviorChange")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "gamification" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("gamification")}
            >
              {t("modal.tabs.gamification")}
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
                  <label className={styles.label}>{t("modal.fields.endDateLabel")}</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  <span className={styles.hint}>{t("modal.fields.endDateHint")}</span>
                  <span className={styles.hint}>{t("modal.fields.remindersMovedHint")}</span>
                  <span className={styles.hint}>{t("modal.fields.habitCreationMovedHint")}</span>
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
            initial && <QuestionnairesTab study={initial} token={token} />
          ) : activeTab === "codes" ? (
            initial && <CodesTab study={initial} token={token} />
          ) : activeTab === "participants" ? (
            initial && <ParticipantsTab study={initial} token={token} />
          ) : activeTab === "cue-config" ? (
            initial && <CueConfigTab study={initial} token={token} />
          ) : activeTab === "habit-creation" ? (
            initial && <HabitCreationTab study={initial} token={token} />
          ) : activeTab === "reminders" ? (
            initial && <RemindersTab study={initial} token={token} />
          ) : activeTab === "behavior-change" ? (
            initial && <BehaviorChangeTab study={initial} token={token} />
          ) : (
            initial && <GamificationTab study={initial} token={token} />
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
