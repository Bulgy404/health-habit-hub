"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { BarChart2 } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import styles from "./page.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
const GROUP_COLORS = ["#45B700", "#E679AB", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444"];

const NEO4J_BROWSER_URL = process.env.NEXT_PUBLIC_NEO4J_BROWSER_URL ?? "http://localhost:7474";
const MONGO_EXPRESS_URL = process.env.NEXT_PUBLIC_MONGO_EXPRESS_URL ?? "http://localhost:8081";

/** The DB queries behind each analytics metric, for transparency/debugging. */
function metricQueries(
  studyId: string,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const uuid = studyId || "<studyId>";
  return [
    {
      metric: t("queries.totalEnrolledWeeklyActiveRate"),
      source: "Neo4j + Mongo",
      query: `// enrolled users (Neo4j)
MATCH (u:User)-[e:ENROLLED_IN]->(:Study {uuid: "${uuid}"})
RETURN u.userID AS userId, e.groupId AS groupId;

// active = ≥1 daily log in last 7 days (Mongo daily_behavior_logs)
db.daily_behavior_logs.aggregate([
  { $match: { userId: { $in: [<enrolledIds>] }, date: { $gte: "<cutoff>" } } },
  { $group: { _id: "$userId" } }
])`,
    },
    {
      metric: t("queries.srhiTrajectoryAvgSrhi"),
      source: "Mongo srhi_responses",
      query: `db.srhi_responses.aggregate([
  { $match: { studyId: ObjectId("${uuid}"), submittedAt: { $ne: null }, score: { $ne: null } } },
  { $group: { _id: { groupId: "$groupId", weekNumber: "$weekNumber" },
              meanScore: { $avg: "$score" }, count: { $sum: 1 } } },
  { $sort: { "_id.weekNumber": 1 } }
])`,
    },
    {
      metric: t("queries.cumulativeDropoutDropouts"),
      source: "Neo4j ENROLLED_IN.droppedOutAt",
      query: `MATCH (u:User)-[e:ENROLLED_IN]->(s:Study {uuid: "${uuid}"})
WHERE e.droppedOutAt IS NOT NULL
RETURN e.groupId AS groupId, e.droppedOutAt AS droppedOutAt`,
    },
    {
      metric: t("queries.questionnaireCompletion"),
      source: "Mongo questionnaire_windows / form_responses",
      query: `// per assigned questionnaire: enrolled with ≥1 response
db.form_responses.find({ userId: { $in: [<enrolledIds>] }, questionnaireSlug: "<slug>" })`,
    },
    {
      metric: t("queries.enrollmentOverTimeHabitsPerGroup"),
      source: "Neo4j",
      query: `// cumulative enrolment (grouped + accumulated in JS)
MATCH (u:User)-[e:ENROLLED_IN]->(:Study {uuid: "${uuid}"})
RETURN e.groupId AS groupId, e.enrolledAt AS enrolledAt;

// habits donated per group
MATCH (u:User)-[e:ENROLLED_IN]->(:Study {uuid: "${uuid}"})
OPTIONAL MATCH (u)-[:DONATED]->(h:Habit)
WHERE h IS NULL OR coalesce(h.is_habit, true) = true
RETURN e.groupId AS groupId, count(h) AS habits`,
    },
    {
      metric: t("queries.dailyActiveTotalLogsIntentions"),
      source: "Mongo daily_behavior_logs, implementation_intentions",
      query: `// distinct active participants per day (last 30d)
db.daily_behavior_logs.aggregate([
  { $match: { userId: { $in: [<enrolledIds>] }, date: { $gte: "<cutoff30>" } } },
  { $group: { _id: { date: "$date", userId: "$userId" } } },
  { $group: { _id: "$_id.date", count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]);

db.implementation_intentions.countDocuments({ userId: { $in: [<enrolledIds>] } })`,
    },
  ];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudySummary {
  id: string;
  name: string;
  groups: { id: string; label: string; index: number }[];
  participantCount: number;
  isActive: boolean;
}

interface WeeklyActiveRate {
  groupId: string | null;
  enrolled: number;
  active: number;
  rate: number;
}

interface SrhiPoint {
  groupId: string | null;
  weekNumber: number;
  meanScore: number;
  count: number;
}

interface DropoutPoint {
  groupId: string | null;
  date: string;
  cumulative: number;
}

interface QuestionnaireCompletion {
  questionnaireId: string;
  slug: string;
  title: string;
  enrolled: number;
  completed: number;
  rate: number;
}

interface DailyActivePoint {
  date: string;
  count: number;
}

interface HabitsByGroupPoint {
  groupId: string | null;
  habits: number;
}

interface Engagement {
  totalHabits: number;
  totalLogs: number;
  totalIntentions: number;
  avgLogsPerActive: number;
  avgIntentionsPerParticipant: number;
}

interface AnalyticsData {
  weeklyActiveRate: WeeklyActiveRate[];
  srhiTrajectory: SrhiPoint[];
  dropoutCurve: DropoutPoint[];
  questionnaireCompletionRates: QuestionnaireCompletion[];
  enrollmentTrend: DropoutPoint[];
  dailyActive: DailyActivePoint[];
  habitsByGroup: HabitsByGroupPoint[];
  engagement: Engagement | null;
}

interface Participant {
  userId: string;
  username: string;
  group: string;
  enrolledAt: string | null;
  lastActive: string | null;
  surveyCompletionPct: number;
  droppedOutAt?: string | null;
}

interface ParticipantProgress {
  profile: { completed: boolean; completedAt: string | null };
  surveys: { id: string; title: string; completedAt: string }[];
  habitsCount: number;
  recommendations: { accepted: number; dismissed: number };
  timeline: { type: string; timestamp: string; detail: string }[];
}

interface ReminderPlanComponents {
  srhi: number;
  adherence14d: number;
  streak: number;
  adherence7d: number;
}

interface ReminderPlan {
  intentionId: string;
  frequency: string;
  autonomyScore: number;
  components: ReminderPlanComponents;
  reminderTime: string | null;
  computedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function RcTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.rcTooltip}>
      {label && <div className={styles.rcTooltipLabel}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(p.value < 10 ? 2 : 0) : p.value}
        </div>
      ))}
    </div>
  );
}

// ── KPI cards ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "warn" | "danger" | "primary";
}) {
  const accentClass =
    accent === "warn"
      ? styles.kpiWarn
      : accent === "danger"
        ? styles.kpiDanger
        : accent === "primary"
          ? styles.kpiAccent
          : "";
  return (
    <div className={styles.kpiCard}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={`${styles.kpiValue} ${accentClass}`}>{value}</span>
      {sub && <span className={styles.kpiSub}>{sub}</span>}
    </div>
  );
}

// ── Participant drawer ────────────────────────────────────────────────────────

const FREQUENCY_LABEL_KEYS: Record<string, string> = {
  daily: "frequency.daily",
  every_2_days: "frequency.every2Days",
  twice_weekly: "frequency.twiceWeekly",
  weekly: "frequency.weekly",
  off: "frequency.off",
};

const FREQUENCY_CSS: Record<string, string> = {
  daily: styles.frequencyDaily,
  every_2_days: styles.frequencyEvery2Days,
  twice_weekly: styles.frequencyTwiceWeekly,
  weekly: styles.frequencyWeekly,
  off: styles.frequencyOff,
};

function ParticipantDrawer({
  participant,
  progress,
  loading,
  plans,
  plansLoading,
  onClose,
}: {
  participant: Participant;
  progress: ParticipantProgress | null;
  loading: boolean;
  plans: ReminderPlan[] | null;
  plansLoading: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("analytics");
  const tc = useTranslations("common");
  const isDropped = !!participant.droppedOutAt;
  const isActive =
    !isDropped &&
    !!participant.lastActive &&
    new Date(participant.lastActive) > new Date(Date.now() - 7 * 86400_000);

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <div className={styles.drawer}>
        <div className={styles.drawerHeader}>
          <div>
            <div className={styles.drawerTitle}>
              {participant.username ?? participant.userId.slice(0, 8)}
            </div>
            <div className={styles.drawerSub}>
              {participant.group ?? "—"} ·{" "}
              {isDropped
                ? t("status.droppedOut")
                : isActive
                  ? t("status.active")
                  : t("status.inactive")}
              {" · "}
              {t("drawer.enrolledOn", { date: fmt(participant.enrolledAt) })}
            </div>
          </div>
          <button className={styles.drawerClose} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.drawerBody}>
          {loading && <div className={styles.loadingState}>{tc("loading")}</div>}

          {!loading && progress && (
            <>
              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>{t("drawer.summary")}</div>
                <div className={styles.drawerStatGrid}>
                  <div className={styles.drawerStat}>
                    <span className={styles.drawerStatLabel}>{t("drawer.habits")}</span>
                    <span className={styles.drawerStatValue}>{progress.habitsCount}</span>
                  </div>
                  <div className={styles.drawerStat}>
                    <span className={styles.drawerStatLabel}>{t("drawer.surveysCompleted")}</span>
                    <span className={styles.drawerStatValue}>{progress.surveys.length}</span>
                  </div>
                  <div className={styles.drawerStat}>
                    <span className={styles.drawerStatLabel}>
                      {t("drawer.recommendationsAccepted")}
                    </span>
                    <span className={styles.drawerStatValue}>
                      {progress.recommendations.accepted}
                    </span>
                  </div>
                  <div className={styles.drawerStat}>
                    <span className={styles.drawerStatLabel}>
                      {t("drawer.recommendationsDismissed")}
                    </span>
                    <span className={styles.drawerStatValue}>
                      {progress.recommendations.dismissed}
                    </span>
                  </div>
                  <div className={styles.drawerStat}>
                    <span className={styles.drawerStatLabel}>{t("drawer.profileComplete")}</span>
                    <span className={styles.drawerStatValue}>
                      {progress.profile.completed ? tc("yes") : tc("no")}
                    </span>
                  </div>
                  <div className={styles.drawerStat}>
                    <span className={styles.drawerStatLabel}>{t("drawer.lastActive")}</span>
                    <span className={styles.drawerStatValue} style={{ fontSize: "0.9rem" }}>
                      {fmt(participant.lastActive)}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>{t("drawer.reminders")}</div>
                {plansLoading ? (
                  <div className={styles.drawerEmpty}>{tc("loading")}</div>
                ) : !plans || plans.length === 0 ? (
                  <div className={styles.drawerEmpty}>{t("drawer.noActiveIntentions")}</div>
                ) : (
                  plans.map((plan) => (
                    <div key={plan.intentionId} className={styles.reminderPlanCard}>
                      <div className={styles.reminderPlanHeader}>
                        <span className={styles.reminderPlanId}>
                          {plan.intentionId.slice(-8)}
                          {plan.reminderTime && ` · ${plan.reminderTime}`}
                        </span>
                        <span
                          className={`${styles.frequencyBadge} ${FREQUENCY_CSS[plan.frequency] ?? ""}`}
                        >
                          {FREQUENCY_LABEL_KEYS[plan.frequency]
                            ? t(FREQUENCY_LABEL_KEYS[plan.frequency])
                            : plan.frequency}
                        </span>
                      </div>
                      <div className={styles.reminderScoreRow}>
                        <span className={styles.reminderScoreLabel}>{t("drawer.score")}</span>
                        <span className={styles.reminderScoreValue}>
                          {plan.autonomyScore.toFixed(3)}
                        </span>
                        <div className={styles.scoreBarWrap}>
                          <div
                            className={styles.scoreBarFill}
                            style={{ width: `${Math.round(plan.autonomyScore * 100)}%` }}
                          />
                        </div>
                      </div>
                      <table className={styles.componentTable}>
                        <thead>
                          <tr>
                            <th>{t("drawer.signal")}</th>
                            <th>{t("drawer.value")}</th>
                            <th>{t("drawer.contribution")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>SRHI</td>
                            <td>{plan.components.srhi.toFixed(3)}</td>
                            <td>
                              {(plan.components.srhi * 0.5).toFixed(3)}{" "}
                              <span className={styles.componentWeight}>×0.50</span>
                            </td>
                          </tr>
                          <tr>
                            <td>{t("drawer.adherence14d")}</td>
                            <td>{plan.components.adherence14d.toFixed(3)}</td>
                            <td>
                              {(plan.components.adherence14d * 0.35).toFixed(3)}{" "}
                              <span className={styles.componentWeight}>×0.35</span>
                            </td>
                          </tr>
                          <tr>
                            <td>{t("drawer.streak")}</td>
                            <td>{plan.components.streak.toFixed(3)}</td>
                            <td>
                              {(plan.components.streak * 0.15).toFixed(3)}{" "}
                              <span className={styles.componentWeight}>×0.15</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className={styles.reminderComputedAt}>
                        {t("drawer.computedOn", { date: fmt(plan.computedAt) })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>{t("drawer.completedSurveys")}</div>
                {progress.surveys.length === 0 ? (
                  <div className={styles.drawerEmpty}>{t("drawer.noSurveysCompleted")}</div>
                ) : (
                  <div className={styles.drawerSurveyList}>
                    {progress.surveys.map((s) => (
                      <div key={s.id} className={styles.drawerSurveyItem}>
                        <span className={styles.drawerSurveyTitle}>{s.title}</span>
                        <span className={styles.drawerSurveyDate}>{fmt(s.completedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>{t("drawer.activityTimeline")}</div>
                {progress.timeline.length === 0 ? (
                  <div className={styles.drawerEmpty}>{t("drawer.noActivityRecorded")}</div>
                ) : (
                  <div className={styles.drawerTimeline}>
                    {progress.timeline.map((ev, i) => (
                      <div key={i} className={styles.drawerTimelineItem}>
                        <div
                          style={{
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                          }}
                        >
                          <div className={styles.drawerTimelineDot} />
                          {i < progress.timeline.length - 1 && (
                            <div className={styles.drawerTimelineLine} />
                          )}
                        </div>
                        <div className={styles.drawerTimelineContent}>
                          <span className={styles.drawerTimelineDetail}>{ev.detail}</span>
                          <span className={styles.drawerTimelineDate}>{fmt(ev.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string })?.accessToken ?? "";
  const t = useTranslations("analytics");
  const tc = useTranslations("common");

  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [studiesLoading, setStudiesLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [showQueries, setShowQueries] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const [drawerParticipant, setDrawerParticipant] = useState<Participant | null>(null);
  const [drawerProgress, setDrawerProgress] = useState<ParticipantProgress | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerPlans, setDrawerPlans] = useState<ReminderPlan[] | null>(null);
  const [drawerPlansLoading, setDrawerPlansLoading] = useState(false);

  // ── Load study list ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    apiFetch<{ studies: StudySummary[] }>(`${API}/admin/studies?limit=100`, token)
      .then((d) => {
        const list = d.studies ?? [];
        setStudies(list);
        // Default to first active study
        const first = list.find((s) => s.isActive) ?? list[0];
        if (first) setSelectedId(first.id);
      })
      .catch(() => {})
      .finally(() => setStudiesLoading(false));
  }, [token]);

  // ── Load analytics + participants when study changes ───────────────────────

  useEffect(() => {
    if (!token || !selectedId) return;
    let cancelled = false;

    setAnalyticsLoading(true);
    setAnalyticsError("");
    setAnalytics(null);
    setParticipants([]);

    Promise.all([
      apiFetch<AnalyticsData>(`${API}/admin/studies/${selectedId}/analytics`, token),
      apiFetch<{ participants: Participant[] } | Participant[]>(
        `${API}/admin/studies/${selectedId}/participants?limit=500`,
        token
      ),
    ])
      .then(([a, p]) => {
        if (cancelled) return;
        setAnalytics(a);
        const list = Array.isArray(p) ? p : (p.participants ?? []);
        setParticipants(list);
      })
      .catch((err) => {
        if (!cancelled) setAnalyticsError(err instanceof Error ? err.message : tc("genericError"));
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, selectedId, tc]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const study = studies.find((s) => s.id === selectedId);

  const groupLabel = (gid: string | null | undefined): string => {
    if (!gid || gid === "unknown") return t("default");
    return study?.groups.find((g) => g.id === gid)?.label ?? gid;
  };

  async function handleParticipantClick(p: Participant) {
    setDrawerParticipant(p);
    setDrawerProgress(null);
    setDrawerLoading(true);
    setDrawerPlans(null);
    setDrawerPlansLoading(true);

    apiFetch<{ plans: ReminderPlan[] }>(
      `${API}/admin/participants/${p.userId}/reminder-plans`,
      token
    )
      .then((d) => setDrawerPlans(d.plans ?? []))
      .catch(() => setDrawerPlans([]))
      .finally(() => setDrawerPlansLoading(false));

    try {
      const data = await apiFetch<ParticipantProgress>(
        `${API}/admin/participants/${p.userId}/progress`,
        token
      );
      setDrawerProgress(data);
    } catch {
      // non-critical — drawer stays open with what we have
    } finally {
      setDrawerLoading(false);
    }
  }

  // KPIs
  const kpi = useMemo(() => {
    if (!analytics) return null;
    const totalEnrolled = analytics.weeklyActiveRate.reduce((s, r) => s + r.enrolled, 0);
    const totalActive = analytics.weeklyActiveRate.reduce((s, r) => s + r.active, 0);
    const totalDropped = participants.filter((p) => p.droppedOutAt).length;
    const dropoutRate = totalEnrolled > 0 ? totalDropped / totalEnrolled : 0;
    const latestWeek = Math.max(...analytics.srhiTrajectory.map((p) => p.weekNumber), 0);
    const latestSrhi = analytics.srhiTrajectory.filter((p) => p.weekNumber === latestWeek);
    const avgSrhi = latestSrhi.length
      ? latestSrhi.reduce((s, p) => s + p.meanScore * p.count, 0) /
        latestSrhi.reduce((s, p) => s + p.count, 0)
      : null;
    const avgQCompletion = analytics.questionnaireCompletionRates.length
      ? analytics.questionnaireCompletionRates.reduce((s, q) => s + q.rate, 0) /
        analytics.questionnaireCompletionRates.length
      : null;
    return {
      totalEnrolled,
      totalActive,
      totalDropped,
      dropoutRate,
      avgSrhi,
      avgQCompletion,
      latestWeek,
    };
  }, [analytics, participants]);

  // Weekly active rate chart data
  const activeRateData = useMemo(
    () =>
      (analytics?.weeklyActiveRate ?? []).map((r) => ({
        group: groupLabel(r.groupId),
        "Active %": Math.round(r.rate * 100),
        active: r.active,
        enrolled: r.enrolled,
        _groupId: r.groupId,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analytics, study]
  );

  // SRHI trajectory: pivot to [{week, Group1: score, Group2: score, ...}]
  const srhiData = useMemo(() => {
    const byWeek: Record<number, Record<string, number | string>> = {};
    for (const p of analytics?.srhiTrajectory ?? []) {
      byWeek[p.weekNumber] = byWeek[p.weekNumber] ?? { week: `W${p.weekNumber}` };
      byWeek[p.weekNumber][groupLabel(p.groupId)] = p.meanScore;
    }
    return Object.values(byWeek).sort((a, b) => {
      const wa = parseInt(String(a.week).slice(1));
      const wb = parseInt(String(b.week).slice(1));
      return wa - wb;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, study]);

  // Dropout curve: pivot to [{date, Group1: cum, ...}]
  const dropoutData = useMemo(() => {
    const byDate: Record<string, Record<string, number | string>> = {};
    for (const p of analytics?.dropoutCurve ?? []) {
      byDate[p.date] = byDate[p.date] ?? { date: p.date.slice(5) };
      byDate[p.date][groupLabel(p.groupId)] = p.cumulative;
    }
    return Object.values(byDate).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, study]);

  // Questionnaire completion — horizontal bar
  const qData = useMemo(
    () =>
      (analytics?.questionnaireCompletionRates ?? []).map((q) => ({
        name: q.title.length > 28 ? q.title.slice(0, 26) + "…" : q.title,
        fullTitle: q.title,
        "Completion %": Math.round(q.rate * 100),
        completed: q.completed,
        enrolled: q.enrolled,
      })),
    [analytics]
  );

  // Groups present in SRHI / dropout for legend
  const srhiGroups = useMemo(
    () => [...new Set((analytics?.srhiTrajectory ?? []).map((p) => groupLabel(p.groupId)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analytics, study]
  );
  const dropoutGroups = useMemo(
    () => [...new Set((analytics?.dropoutCurve ?? []).map((p) => groupLabel(p.groupId)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analytics, study]
  );

  // Enrollment over time: pivot to [{date, Group1: cum, ...}]
  const enrollmentData = useMemo(() => {
    const byDate: Record<string, Record<string, number | string>> = {};
    for (const p of analytics?.enrollmentTrend ?? []) {
      byDate[p.date] = byDate[p.date] ?? { date: p.date.slice(5) };
      byDate[p.date][groupLabel(p.groupId)] = p.cumulative;
    }
    return Object.values(byDate).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, study]);
  const enrollmentGroups = useMemo(
    () => [...new Set((analytics?.enrollmentTrend ?? []).map((p) => groupLabel(p.groupId)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analytics, study]
  );

  // Daily active participants (last 30 days).
  const dailyActiveData = useMemo(
    () =>
      (analytics?.dailyActive ?? []).map((d) => ({
        date: d.date.slice(5),
        Active: d.count,
      })),
    [analytics]
  );

  // Habits donated per group.
  const habitsByGroupData = useMemo(
    () =>
      (analytics?.habitsByGroup ?? []).map((h) => ({
        group: groupLabel(h.groupId),
        Habits: h.habits,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analytics, study]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <div className={styles.studySelector}>
          <span className={styles.studyLabel}>{t("studyLabel")}</span>
          {studiesLoading ? (
            <select className={styles.studySelect} disabled>
              <option>{tc("loading")}</option>
            </select>
          ) : (
            <select
              className={styles.studySelect}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {studies.length === 0 && <option value="">{t("noStudies")}</option>}
              {studies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isActive ? "" : t("inactiveSuffix")}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* No study yet */}
      {!selectedId && (
        <div className={styles.prompt}>
          <BarChart2 size={32} strokeWidth={1.5} className={styles.promptIcon} />
          <span className={styles.promptText}>{t("selectStudyPrompt")}</span>
        </div>
      )}

      {selectedId && analyticsError && <div className={styles.errorMsg}>{analyticsError}</div>}

      {selectedId && analyticsLoading && (
        <div className={styles.loadingState}>{t("loadingAnalytics")}</div>
      )}

      {selectedId && !analyticsLoading && analytics && kpi && (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────────── */}
          <div className={styles.kpiGrid}>
            <KpiCard
              label={t("kpi.totalEnrolled")}
              value={kpi.totalEnrolled}
              sub={t("kpi.totalEnrolledSub", { count: study?.groups.length ?? 0 })}
            />
            <KpiCard
              label={t("kpi.activeLast7Days")}
              value={kpi.totalActive}
              sub={t("kpi.activeLast7DaysSub", {
                percent:
                  kpi.totalEnrolled > 0
                    ? Math.round((kpi.totalActive / kpi.totalEnrolled) * 100)
                    : 0,
              })}
              accent="primary"
            />
            <KpiCard
              label={t("kpi.dropouts")}
              value={kpi.totalDropped}
              sub={t("kpi.dropoutsSub", { percent: Math.round(kpi.dropoutRate * 100) })}
              accent={kpi.dropoutRate > 0.2 ? "danger" : kpi.dropoutRate > 0.1 ? "warn" : undefined}
            />
            <KpiCard
              label={
                kpi.latestWeek
                  ? t("kpi.avgSrhiWithWeek", { week: kpi.latestWeek })
                  : t("kpi.avgSrhi")
              }
              value={kpi.avgSrhi != null ? kpi.avgSrhi.toFixed(2) : "—"}
              sub={t("kpi.avgSrhiSub")}
              accent={kpi.avgSrhi != null && kpi.avgSrhi >= 5 ? "primary" : undefined}
            />
            <KpiCard
              label={t("kpi.avgQuestionnaireCompletion")}
              value={kpi.avgQCompletion != null ? `${Math.round(kpi.avgQCompletion * 100)}%` : "—"}
              sub={t("kpi.avgQuestionnaireCompletionSub")}
              accent={kpi.avgQCompletion != null && kpi.avgQCompletion < 0.5 ? "warn" : undefined}
            />
            <KpiCard
              label={t("kpi.habitsDonated")}
              value={analytics.engagement?.totalHabits ?? 0}
              sub={t("kpi.habitsDonatedSub")}
            />
            <KpiCard
              label={t("kpi.totalLogs")}
              value={analytics.engagement?.totalLogs ?? 0}
              sub={t("kpi.totalLogsSub", {
                count: (analytics.engagement?.avgLogsPerActive ?? 0).toFixed(1),
              })}
            />
            <KpiCard
              label={t("kpi.avgIntentions")}
              value={(analytics.engagement?.avgIntentionsPerParticipant ?? 0).toFixed(1)}
              sub={t("kpi.avgIntentionsSub")}
            />
          </div>

          {/* ── Underlying queries + raw data links ───────────────────────── */}
          <div className={styles.queryPanel}>
            <button className={styles.queryToggle} onClick={() => setShowQueries((s) => !s)}>
              {showQueries ? "▾" : "▸"} {t("queryPanel.toggle")}
            </button>
            {showQueries && (
              <div className={styles.queryBody}>
                <div className={styles.queryLinks}>
                  <a href={NEO4J_BROWSER_URL} target="_blank" rel="noopener noreferrer">
                    {t("queryPanel.openNeo4jBrowser")}
                  </a>
                  <a href={MONGO_EXPRESS_URL} target="_blank" rel="noopener noreferrer">
                    {t("queryPanel.openMongoExpress")}
                  </a>
                </div>
                {metricQueries(selectedId, t).map((q) => (
                  <div key={q.metric} className={styles.queryItem}>
                    <div className={styles.queryMetric}>
                      {q.metric} <span className={styles.querySource}>{q.source}</span>
                    </div>
                    <pre className={styles.queryCode}>{q.query}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Charts ────────────────────────────────────────────────────── */}
          <div className={styles.chartGrid}>
            {/* Weekly active rate */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{t("charts.weeklyActiveRate.title")}</p>
              <p className={styles.chartDesc}>{t("charts.weeklyActiveRate.desc")}</p>
              {activeRateData.length === 0 ? (
                <div className={styles.emptyState}>{t("charts.weeklyActiveRate.empty")}</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={activeRateData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="group" tick={{ fontSize: 12 }} />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11 }}
                        width={38}
                      />
                      <Tooltip
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <div className={styles.rcTooltip}>
                              <div className={styles.rcTooltipLabel}>{label}</div>
                              <div>
                                {t("charts.weeklyActiveRate.tooltipActive", {
                                  active: payload[0]?.payload.active,
                                  enrolled: payload[0]?.payload.enrolled,
                                })}
                              </div>
                              <div>
                                {t("charts.weeklyActiveRate.tooltipRate", {
                                  rate: String(payload[0]?.value ?? ""),
                                })}
                              </div>
                            </div>
                          ) : null
                        }
                      />
                      <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="4 2" />
                      <Bar dataKey="Active %" radius={[4, 4, 0, 0]}>
                        {activeRateData.map((_, i) => (
                          <Cell key={i} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* SRHI trajectory */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{t("charts.srhiTrajectory.title")}</p>
              <p className={styles.chartDesc}>{t("charts.srhiTrajectory.desc")}</p>
              {srhiData.length === 0 ? (
                <div className={styles.emptyState}>{t("charts.srhiTrajectory.empty")}</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={srhiData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis
                        domain={[1, 7]}
                        ticks={[1, 2, 3, 4, 5, 6, 7]}
                        tick={{ fontSize: 11 }}
                        width={24}
                      />
                      <Tooltip content={<RcTooltip />} />
                      <ReferenceLine
                        y={4}
                        stroke="#94a3b8"
                        strokeDasharray="4 2"
                        label={{
                          value: t("charts.srhiTrajectory.habitThreshold"),
                          fontSize: 10,
                          fill: "#94a3b8",
                        }}
                      />
                      {srhiGroups.map((g, i) => (
                        <Line
                          key={g}
                          type="monotone"
                          dataKey={g}
                          stroke={GROUP_COLORS[i % GROUP_COLORS.length]}
                          strokeWidth={2.5}
                          dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <div className={styles.legend}>
                    {srhiGroups.map((g, i) => (
                      <span key={g} className={styles.legendItem}>
                        <span
                          className={styles.legendDot}
                          style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                        />
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cumulative dropout */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{t("charts.cumulativeDropout.title")}</p>
              <p className={styles.chartDesc}>{t("charts.cumulativeDropout.desc")}</p>
              {dropoutData.length === 0 ? (
                <div className={styles.emptyState}>{t("charts.cumulativeDropout.empty")}</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={dropoutData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                      <Tooltip content={<RcTooltip />} />
                      {dropoutGroups.map((g, i) => (
                        <Line
                          key={g}
                          type="stepAfter"
                          dataKey={g}
                          stroke={GROUP_COLORS[i % GROUP_COLORS.length]}
                          strokeWidth={2.5}
                          strokeDasharray="6 3"
                          dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <div className={styles.legend}>
                    {dropoutGroups.map((g, i) => (
                      <span key={g} className={styles.legendItem}>
                        <span
                          className={styles.legendDot}
                          style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                        />
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Questionnaire completion */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{t("charts.questionnaireCompletion.title")}</p>
              <p className={styles.chartDesc}>{t("charts.questionnaireCompletion.desc")}</p>
              {qData.length === 0 ? (
                <div className={styles.emptyState}>{t("charts.questionnaireCompletion.empty")}</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={Math.max(220, qData.length * 44)}>
                    <BarChart
                      data={qData}
                      layout="vertical"
                      margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) =>
                          active && payload?.length ? (
                            <div className={styles.rcTooltip}>
                              <div className={styles.rcTooltipLabel}>
                                {payload[0]?.payload.fullTitle}
                              </div>
                              <div>
                                {t("charts.questionnaireCompletion.tooltipCompleted", {
                                  completed: payload[0]?.payload.completed,
                                  enrolled: payload[0]?.payload.enrolled,
                                })}
                              </div>
                              <div>
                                {t("charts.questionnaireCompletion.tooltipRate", {
                                  rate: String(payload[0]?.value ?? ""),
                                })}
                              </div>
                            </div>
                          ) : null
                        }
                      />
                      <ReferenceLine x={80} stroke="#94a3b8" strokeDasharray="4 2" />
                      <Bar dataKey="Completion %" radius={[0, 4, 4, 0]}>
                        {qData.map((_, i) => (
                          <Cell key={i} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Enrollment over time */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{t("charts.enrollmentOverTime.title")}</p>
              <p className={styles.chartDesc}>{t("charts.enrollmentOverTime.desc")}</p>
              {enrollmentData.length === 0 ? (
                <div className={styles.emptyState}>{t("charts.enrollmentOverTime.empty")}</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={enrollmentData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                      <Tooltip content={<RcTooltip />} />
                      {enrollmentGroups.map((g, i) => (
                        <Line
                          key={g}
                          type="stepAfter"
                          dataKey={g}
                          stroke={GROUP_COLORS[i % GROUP_COLORS.length]}
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <div className={styles.legend}>
                    {enrollmentGroups.map((g, i) => (
                      <span key={g} className={styles.legendItem}>
                        <span
                          className={styles.legendDot}
                          style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                        />
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Daily active participants */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{t("charts.dailyActive.title")}</p>
              <p className={styles.chartDesc}>{t("charts.dailyActive.desc")}</p>
              {dailyActiveData.length === 0 ? (
                <div className={styles.emptyState}>{t("charts.dailyActive.empty")}</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={dailyActiveData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                      <Tooltip content={<RcTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="Active"
                        stroke={GROUP_COLORS[2]}
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Habits donated per group */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{t("charts.habitsByGroup.title")}</p>
              <p className={styles.chartDesc}>{t("charts.habitsByGroup.desc")}</p>
              {habitsByGroupData.length === 0 ? (
                <div className={styles.emptyState}>{t("charts.habitsByGroup.empty")}</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={habitsByGroupData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="group" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                      <Tooltip content={<RcTooltip />} />
                      <Bar dataKey="Habits" radius={[4, 4, 0, 0]}>
                        {habitsByGroupData.map((_, i) => (
                          <Cell key={i} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* ── Participant table ──────────────────────────────────────────── */}
          <div className={styles.tableSection}>
            <div className={styles.tableSectionHeader}>
              <span className={styles.tableSectionTitle}>{t("table.sectionTitle")}</span>
              <span className={styles.tableCount}>
                {t("table.enrolledCount", { count: participants.length })}
              </span>
            </div>
            {participantsLoading ? (
              <div className={styles.loadingState}>{t("table.loadingParticipants")}</div>
            ) : participants.length === 0 ? (
              <div className={styles.emptyState}>{t("table.noParticipants")}</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("table.headerId")}</th>
                    <th>{t("table.headerGroup")}</th>
                    <th>{t("table.headerEnrolled")}</th>
                    <th>{t("table.headerLastActive")}</th>
                    <th>{t("table.headerSurveyCompletion")}</th>
                    <th>{t("table.headerStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => {
                    const isDropped = !!p.droppedOutAt;
                    const isActive =
                      !isDropped &&
                      !!p.lastActive &&
                      new Date(p.lastActive) > new Date(Date.now() - 7 * 86400_000);
                    return (
                      <tr
                        key={p.userId}
                        className={styles.clickableRow}
                        onClick={() => handleParticipantClick(p)}
                        title={t("table.clickToView")}
                      >
                        <td className={styles.mono}>{p.username ?? p.userId.slice(0, 8)}</td>
                        <td>{p.group ?? "—"}</td>
                        <td>{fmt(p.enrolledAt)}</td>
                        <td>{fmt(p.lastActive)}</td>
                        <td>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: `${Math.round((p.surveyCompletionPct ?? 0) * 100)}px`,
                                maxWidth: "80px",
                                height: "6px",
                                background: "var(--color-primary)",
                                borderRadius: "3px",
                                minWidth: "2px",
                              }}
                            />
                            {Math.round((p.surveyCompletionPct ?? 0) * 100)}%
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${
                              isDropped
                                ? styles.statusDropped
                                : isActive
                                  ? styles.statusActive
                                  : styles.statusInactive
                            }`}
                          >
                            {isDropped
                              ? t("status.droppedOut")
                              : isActive
                                ? t("status.active")
                                : t("status.inactive")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {drawerParticipant && (
        <ParticipantDrawer
          participant={drawerParticipant}
          progress={drawerProgress}
          loading={drawerLoading}
          plans={drawerPlans}
          plansLoading={drawerPlansLoading}
          onClose={() => {
            setDrawerParticipant(null);
            setDrawerProgress(null);
            setDrawerPlans(null);
          }}
        />
      )}
    </div>
  );
}
