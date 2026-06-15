"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudySummary {
  id: string;
  name: string;
  groups: { id: string; label: string; index: number }[];
  participantCount: number;
  isActive: boolean;
}

interface WeeklyActiveRate {
  groupId: string;
  enrolled: number;
  active: number;
  rate: number;
}

interface SrhiPoint {
  groupId: string;
  weekNumber: number;
  meanScore: number;
  count: number;
}

interface DropoutPoint {
  groupId: string;
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

interface AnalyticsData {
  weeklyActiveRate: WeeklyActiveRate[];
  srhiTrajectory: SrhiPoint[];
  dropoutCurve: DropoutPoint[];
  questionnaireCompletionRates: QuestionnaireCompletion[];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
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
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function RcTooltip({ active, payload, label }: {
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

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: "warn" | "danger" | "primary";
}) {
  const accentClass = accent === "warn" ? styles.kpiWarn : accent === "danger" ? styles.kpiDanger : accent === "primary" ? styles.kpiAccent : "";
  return (
    <div className={styles.kpiCard}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={`${styles.kpiValue} ${accentClass}`}>{value}</span>
      {sub && <span className={styles.kpiSub}>{sub}</span>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string })?.accessToken ?? "";

  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [studiesLoading, setStudiesLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

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
      apiFetch<{ participants: Participant[] } | Participant[]>(`${API}/admin/studies/${selectedId}/participants?limit=500`, token),
    ])
      .then(([a, p]) => {
        if (cancelled) return;
        setAnalytics(a);
        const list = Array.isArray(p) ? p : (p.participants ?? []);
        setParticipants(list);
      })
      .catch((err) => {
        if (!cancelled) setAnalyticsError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false); });

    return () => { cancelled = true; };
  }, [token, selectedId]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const study = studies.find((s) => s.id === selectedId);

  const groupLabel = (gid: string) =>
    study?.groups.find((g) => g.id === gid)?.label ?? gid;

  // KPIs
  const kpi = useMemo(() => {
    if (!analytics) return null;
    const totalEnrolled = analytics.weeklyActiveRate.reduce((s, r) => s + r.enrolled, 0);
    const totalActive   = analytics.weeklyActiveRate.reduce((s, r) => s + r.active, 0);
    const totalDropped  = participants.filter((p) => p.droppedOutAt).length;
    const dropoutRate   = totalEnrolled > 0 ? totalDropped / totalEnrolled : 0;
    const latestWeek    = Math.max(...(analytics.srhiTrajectory.map((p) => p.weekNumber)), 0);
    const latestSrhi    = analytics.srhiTrajectory.filter((p) => p.weekNumber === latestWeek);
    const avgSrhi       = latestSrhi.length
      ? latestSrhi.reduce((s, p) => s + p.meanScore * p.count, 0) /
        latestSrhi.reduce((s, p) => s + p.count, 0)
      : null;
    const avgQCompletion = analytics.questionnaireCompletionRates.length
      ? analytics.questionnaireCompletionRates.reduce((s, q) => s + q.rate, 0) /
        analytics.questionnaireCompletionRates.length
      : null;
    return { totalEnrolled, totalActive, totalDropped, dropoutRate, avgSrhi, avgQCompletion, latestWeek };
  }, [analytics, participants]);

  // Weekly active rate chart data
  const activeRateData = useMemo(() =>
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
  const qData = useMemo(() =>
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
  const srhiGroups = useMemo(() => [...new Set((analytics?.srhiTrajectory ?? []).map((p) => groupLabel(p.groupId)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analytics, study]);
  const dropoutGroups = useMemo(() => [...new Set((analytics?.dropoutCurve ?? []).map((p) => groupLabel(p.groupId)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analytics, study]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.subtitle}>Study-level metrics for researchers</p>
        </div>
        <div className={styles.studySelector}>
          <span className={styles.studyLabel}>Study</span>
          {studiesLoading ? (
            <select className={styles.studySelect} disabled><option>Loading…</option></select>
          ) : (
            <select
              className={styles.studySelect}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {studies.length === 0 && <option value="">No studies</option>}
              {studies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* No study yet */}
      {!selectedId && (
        <div className={styles.prompt}>
          <span className={styles.promptIcon}>📊</span>
          <span className={styles.promptText}>Select a study above to see analytics</span>
        </div>
      )}

      {selectedId && analyticsError && (
        <div className={styles.errorMsg}>{analyticsError}</div>
      )}

      {selectedId && analyticsLoading && (
        <div className={styles.loadingState}>Loading analytics…</div>
      )}

      {selectedId && !analyticsLoading && analytics && kpi && (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────────── */}
          <div className={styles.kpiGrid}>
            <KpiCard
              label="Total enrolled"
              value={kpi.totalEnrolled}
              sub={`across ${study?.groups.length ?? 0} groups`}
            />
            <KpiCard
              label="Active (last 7 days)"
              value={kpi.totalActive}
              sub={`${kpi.totalEnrolled > 0 ? Math.round((kpi.totalActive / kpi.totalEnrolled) * 100) : 0}% of enrolled`}
              accent="primary"
            />
            <KpiCard
              label="Dropouts"
              value={kpi.totalDropped}
              sub={`${Math.round(kpi.dropoutRate * 100)}% dropout rate`}
              accent={kpi.dropoutRate > 0.2 ? "danger" : kpi.dropoutRate > 0.1 ? "warn" : undefined}
            />
            <KpiCard
              label={`Avg SRHI${kpi.latestWeek ? ` (W${kpi.latestWeek})` : ""}`}
              value={kpi.avgSrhi != null ? kpi.avgSrhi.toFixed(2) : "—"}
              sub="mean habit strength / 7"
              accent={kpi.avgSrhi != null && kpi.avgSrhi >= 5 ? "primary" : undefined}
            />
            <KpiCard
              label="Avg questionnaire completion"
              value={kpi.avgQCompletion != null ? `${Math.round(kpi.avgQCompletion * 100)}%` : "—"}
              sub="across all assigned questionnaires"
              accent={
                kpi.avgQCompletion != null && kpi.avgQCompletion < 0.5 ? "warn" : undefined
              }
            />
          </div>

          {/* ── Charts ────────────────────────────────────────────────────── */}
          <div className={styles.chartGrid}>

            {/* Weekly active rate */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Weekly Active Rate</p>
              <p className={styles.chartDesc}>% of enrolled with ≥1 log in the last 7 days, per condition</p>
              {activeRateData.length === 0 ? (
                <div className={styles.emptyState}>No enrollment data yet.</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={activeRateData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="group" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={38} />
                      <Tooltip content={
                        ({ active, payload, label }) => active && payload?.length ? (
                          <div className={styles.rcTooltip}>
                            <div className={styles.rcTooltipLabel}>{label}</div>
                            <div>Active: {payload[0]?.payload.active} / {payload[0]?.payload.enrolled}</div>
                            <div>Rate: {payload[0]?.value}%</div>
                          </div>
                        ) : null
                      } />
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
              <p className={styles.chartTitle}>SRHI Trajectory</p>
              <p className={styles.chartDesc}>Mean habit strength per week per condition (1–7 scale)</p>
              {srhiData.length === 0 ? (
                <div className={styles.emptyState}>No SRHI data yet.</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={srhiData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis domain={[1, 7]} ticks={[1, 2, 3, 4, 5, 6, 7]} tick={{ fontSize: 11 }} width={24} />
                      <Tooltip content={<RcTooltip />} />
                      <ReferenceLine y={4} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: "habit threshold", fontSize: 10, fill: "#94a3b8" }} />
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
                        <span className={styles.legendDot} style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cumulative dropout */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Cumulative Dropout</p>
              <p className={styles.chartDesc}>Participants who dropped out over time, per condition</p>
              {dropoutData.length === 0 ? (
                <div className={styles.emptyState}>No dropouts recorded.</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dropoutData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
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
                        <span className={styles.legendDot} style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Questionnaire completion */}
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Questionnaire Completion</p>
              <p className={styles.chartDesc}>% of enrolled who submitted each questionnaire</p>
              {qData.length === 0 ? (
                <div className={styles.emptyState}>No questionnaires assigned.</div>
              ) : (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={Math.max(220, qData.length * 44)}>
                    <BarChart
                      data={qData}
                      layout="vertical"
                      margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip content={
                        ({ active, payload }) => active && payload?.length ? (
                          <div className={styles.rcTooltip}>
                            <div className={styles.rcTooltipLabel}>{payload[0]?.payload.fullTitle}</div>
                            <div>Completed: {payload[0]?.payload.completed} / {payload[0]?.payload.enrolled}</div>
                            <div>Rate: {payload[0]?.value}%</div>
                          </div>
                        ) : null
                      } />
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

          </div>

          {/* ── Participant table ──────────────────────────────────────────── */}
          <div className={styles.tableSection}>
            <div className={styles.tableSectionHeader}>
              <span className={styles.tableSectionTitle}>Participants</span>
              <span className={styles.tableCount}>{participants.length} enrolled</span>
            </div>
            {participantsLoading ? (
              <div className={styles.loadingState}>Loading participants…</div>
            ) : participants.length === 0 ? (
              <div className={styles.emptyState}>No participants enrolled yet.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Group</th>
                    <th>Enrolled</th>
                    <th>Last active</th>
                    <th>Survey completion</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => {
                    const isDropped = !!p.droppedOutAt;
                    const isActive = !isDropped && !!p.lastActive &&
                      new Date(p.lastActive) > new Date(Date.now() - 7 * 86400_000);
                    return (
                      <tr key={p.userId}>
                        <td className={styles.mono}>{p.username ?? p.userId.slice(0, 8)}</td>
                        <td>{p.group ?? "—"}</td>
                        <td>{fmt(p.enrolledAt)}</td>
                        <td>{fmt(p.lastActive)}</td>
                        <td>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{
                              display: "inline-block",
                              width: `${Math.round((p.surveyCompletionPct ?? 0) * 100)}px`,
                              maxWidth: "80px",
                              height: "6px",
                              background: "var(--color-primary)",
                              borderRadius: "3px",
                              minWidth: "2px",
                            }} />
                            {Math.round((p.surveyCompletionPct ?? 0) * 100)}%
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${
                            isDropped ? styles.statusDropped :
                            isActive  ? styles.statusActive  : styles.statusInactive
                          }`}>
                            {isDropped ? "Dropped out" : isActive ? "Active" : "Inactive"}
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
    </div>
  );
}
