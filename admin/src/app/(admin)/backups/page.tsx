"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { apiFetch, apiUpload, apiUrl } from "@/lib/api";
import { ToggleSwitch } from "@/components/toggle-switch";
import styles from "@/components/admin-page.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Manifest {
  date: string;
  file: string;
  source?: "uploaded";
  trigger: string;
  sizeBytes: number;
  mongoOk: boolean;
  mongoIncluded?: boolean;
  lightragOk: boolean;
  lightragIncluded?: boolean;
  neo4jOk: boolean;
  neo4jIncluded?: boolean;
  keycloakOk: boolean;
  keycloakSkipped: boolean;
  // Absent on backups taken before the Keycloak database dump existed —
  // only the realm-config export (keycloakOk above) was ever captured then.
  keycloakDbOk?: boolean;
  keycloakDbSkipped?: boolean;
  keycloakIncluded?: boolean;
  errors: number;
  errorLog: string;
  durationSeconds: number | null;
  note?: string;
}

/** Which services a backup/restore trigger included — omitted key = included. */
interface ServiceSelection {
  mongo?: boolean;
  neo4j?: boolean;
  lightrag?: boolean;
  keycloak?: boolean;
}

interface StatusResponse {
  lastBackup: Manifest | null;
  history: Manifest[];
  running: boolean;
}

interface JobState {
  jobId: string;
  type: "backup" | "restore";
  reason?: string;
  phase: "running" | "pre_restore_safety" | "restoring" | "done" | "failed";
  targetFilename?: string;
  safetyBackupFile?: string;
  createdFile?: string;
  error?: string;
  result?: {
    mongo: boolean | null;
    lightrag: boolean | null;
    neo4j: boolean | null;
    keycloak: boolean | null;
  };
  // Live progress within backup.sh's 5 stages (Mongo/LightRAG/Neo4j/Keycloak/
  // archive) — absent once the phase moves past what has step markers
  // (e.g. "restoring", which runs restore.sh instead).
  step?: number;
  totalSteps?: number;
  stepLabel?: string;
  startedAt: string;
  finishedAt?: string;
}

interface AuditEntry {
  id: string;
  byUsername: string;
  action: "trigger" | "restore" | "upload" | "download" | "delete";
  filename: string | null;
  result: "requested" | "succeeded" | "failed";
  detail: string | null;
  createdAt: string;
}

const BASE = apiUrl("/admin/backups");
const POLL_MS = 3000;
const IN_PROGRESS_PHASES = ["running", "pre_restore_safety", "restoring"];

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

type ComponentStatus = "ok" | "failed" | "skipped" | "excluded";

function componentStatus(
  included: boolean | undefined,
  ok: boolean,
  skipped?: boolean
): ComponentStatus {
  if (included === false) return "excluded";
  if (skipped) return "skipped";
  return ok ? "ok" : "failed";
}

// Component names (Mongo, LightRAG, Neo4j, Keycloak) are product/technical
// names and are not translated.
function componentBadges(m: Manifest): { label: string; status: ComponentStatus }[] {
  // keycloakDbOk/keycloakDbSkipped are absent on backups taken before the DB
  // dump existed — fold in only when present, so older backups keep judging
  // "Keycloak" solely on the realm export they actually had.
  const dbTracked = m.keycloakDbOk !== undefined;
  const keycloakOk = m.keycloakOk && (!dbTracked || !!m.keycloakDbOk);
  const keycloakSkipped = m.keycloakSkipped && (!dbTracked || !!m.keycloakDbSkipped);
  return [
    { label: "Mongo", status: componentStatus(m.mongoIncluded, m.mongoOk) },
    { label: "LightRAG", status: componentStatus(m.lightragIncluded, m.lightragOk) },
    { label: "Neo4j", status: componentStatus(m.neo4jIncluded, m.neo4jOk) },
    {
      label: "Keycloak",
      status: componentStatus(m.keycloakIncluded, keycloakOk, keycloakSkipped),
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BackupsPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("backups");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Manifest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Manifest | null>(null);
  const [showTriggerOptions, setShowTriggerOptions] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phaseLabel: Record<JobState["phase"], string> = {
    running: t("phase.running"),
    pre_restore_safety: t("phase.preRestoreSafety"),
    restoring: t("phase.restoring"),
    done: t("phase.done"),
    failed: t("phase.failed"),
  };

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [statusRes, jobRes, auditRes] = await Promise.all([
        apiFetch(`${BASE}/status`, token),
        apiFetch(`${BASE}/jobs/current`, token),
        apiFetch(`${BASE}/audit-log?limit=25`, token),
      ]);
      setStatus(statusRes as StatusResponse);
      setJob(jobRes as JobState | null);
      setAuditLog((auditRes as { entries: AuditEntry[] }).entries ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  // Poll while a job is in progress; stop once it reaches a terminal phase.
  useEffect(() => {
    const inProgress = job ? IN_PROGRESS_PHASES.includes(job.phase) : false;
    if (inProgress && !pollRef.current) {
      pollRef.current = setInterval(refresh, POLL_MS);
    }
    if (!inProgress && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job, refresh]);

  async function handleTrigger(services: ServiceSelection) {
    if (!token) return;
    setTriggering(true);
    setError("");
    try {
      await apiFetch(`${BASE}/trigger`, token, {
        method: "POST",
        body: JSON.stringify({ services }),
      });
      setShowTriggerOptions(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("triggerFailed"));
    } finally {
      setTriggering(false);
    }
  }

  async function handleUpload() {
    if (!token || !uploadFile) return;
    setUploading(true);
    setError("");
    try {
      await apiUpload(`${BASE}/upload`, token, uploadFile);
      setUploadFile(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(manifest: Manifest) {
    if (!token) return;
    setDownloadingFile(manifest.file);
    setError("");
    try {
      const res = await fetch(`${BASE}/${manifest.file}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = manifest.file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("downloadFailed"));
    } finally {
      setDownloadingFile(null);
    }
  }

  const running = job ? IN_PROGRESS_PHASES.includes(job.phase) : false;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <button
          className={styles.addButton}
          onClick={() => setShowTriggerOptions(true)}
          disabled={triggering || running}
        >
          {triggering ? t("startingEllipsis") : t("triggerNow")}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* Only shown while a job is actually running or just failed — once
          it's done there's nothing left to report, and "Last backup" below
          already shows what just completed. */}
      {job && job.phase !== "done" && (
        <div
          className={
            job.phase === "failed"
              ? `${styles.statusBanner} ${styles.statusBannerFailed}`
              : styles.statusBanner
          }
        >
          <strong>{phaseLabel[job.phase]}</strong>
          {job.type === "restore" && job.targetFilename && (
            <span className={styles.muted}> — {job.targetFilename}</span>
          )}
          {job.step != null && job.totalSteps != null && (
            <div style={{ marginTop: "0.6rem" }}>
              <div
                role="progressbar"
                aria-valuenow={job.step}
                aria-valuemin={0}
                aria-valuemax={job.totalSteps}
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "#e0e7ff",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(job.step / job.totalSteps) * 100}%`,
                    background: "var(--color-primary)",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <div className={styles.muted} style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
                {t("stepProgress", {
                  step: job.step,
                  totalSteps: job.totalSteps,
                  label: job.stepLabel ?? "",
                })}
              </div>
            </div>
          )}
          {job.phase === "failed" && job.error && (
            <p className={styles.error} style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              {job.error}
            </p>
          )}
          {job.safetyBackupFile && (
            <p
              className={styles.muted}
              style={{ marginTop: "0.35rem", marginBottom: 0, fontSize: "0.8rem" }}
            >
              {t("safetyBackupTakenFirst")}{" "}
              <span className={styles.code}>{job.safetyBackupFile}</span>
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p>{t("loadingEllipsis")}</p>
      ) : (
        <>
          <p className={styles.subtitle} style={{ marginBottom: "0.5rem" }}>
            {t("lastBackup")}
          </p>
          {status?.lastBackup ? (
            <BackupRow
              manifest={status.lastBackup}
              onRestore={setRestoreTarget}
              onDownload={handleDownload}
              onDelete={setDeleteTarget}
              downloading={downloadingFile === status.lastBackup.file}
              disabled={running}
            />
          ) : (
            <p className={styles.muted}>{t("noBackupsYet")}</p>
          )}

          <div
            style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <input
              type="file"
              accept=".tar.gz,.tgz"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
            <button
              className={styles.secondaryButton}
              onClick={handleUpload}
              disabled={!uploadFile || uploading}
            >
              {uploading ? t("uploadingEllipsis") : t("uploadBackup")}
            </button>
          </div>

          <p className={styles.subtitle} style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>
            {t("allBackups")}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("file")}</th>
                  <th>{t("date")}</th>
                  <th>{t("source")}</th>
                  <th>{t("size")}</th>
                  <th>{t("components")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(status?.history ?? []).map((m) => (
                  <tr key={m.file}>
                    <td>
                      <span className={styles.code}>{m.file}</span>
                    </td>
                    <td>
                      {formatDate(m.date)}
                      <div className={styles.muted} style={{ fontSize: "0.75rem" }}>
                        <TimeAgo iso={m.date} />
                      </div>
                    </td>
                    <td>
                      <span className={styles.badge}>
                        {m.source === "uploaded" ? t("uploaded") : m.trigger}
                      </span>
                    </td>
                    <td>{formatBytes(m.sizeBytes)}</td>
                    <td>
                      <ComponentBadges manifest={m} />
                    </td>
                    <td style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <button
                        className={styles.actionBtn}
                        onClick={() => handleDownload(m)}
                        disabled={downloadingFile === m.file}
                      >
                        {downloadingFile === m.file ? t("downloadingEllipsis") : t("download")}
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.primaryBtn}`}
                        onClick={() => setRestoreTarget(m)}
                        disabled={running}
                      >
                        {t("restore")}
                      </button>
                      <button
                        className={styles.actionBtn}
                        style={{ color: "#dc2626" }}
                        onClick={() => setDeleteTarget(m)}
                        disabled={running}
                      >
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
                {(status?.history ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: "center", padding: "2rem" }}
                      className={styles.muted}
                    >
                      {t("noBackupsYet")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className={styles.subtitle} style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>
            {t("recentActivity")}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("when")}</th>
                  <th>{t("who")}</th>
                  <th>{t("action")}</th>
                  <th>{t("file")}</th>
                  <th>{t("result")}</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.createdAt)}</td>
                    <td>{e.byUsername}</td>
                    <td style={{ textTransform: "capitalize" }}>{t(`actions.${e.action}`)}</td>
                    <td>{e.filename ? <span className={styles.code}>{e.filename}</span> : "—"}</td>
                    <td>
                      <span
                        className={styles.badge}
                        style={
                          e.result === "failed"
                            ? { background: "#fef2f2", color: "#dc2626" }
                            : e.result === "succeeded"
                              ? { background: "#f0fdf4", color: "#16a34a" }
                              : undefined
                        }
                      >
                        {t(`results.${e.result}`)}
                      </span>
                    </td>
                  </tr>
                ))}
                {auditLog.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: "center", padding: "2rem" }}
                      className={styles.muted}
                    >
                      {t("noActivityYet")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {restoreTarget && token && (
        <RestoreModal
          manifest={restoreTarget}
          token={token}
          onClose={() => setRestoreTarget(null)}
          onStarted={async () => {
            setRestoreTarget(null);
            await refresh();
          }}
        />
      )}

      {deleteTarget && token && (
        <DeleteModal
          manifest={deleteTarget}
          token={token}
          onClose={() => setDeleteTarget(null)}
          onDeleted={async () => {
            setDeleteTarget(null);
            await refresh();
          }}
        />
      )}

      {showTriggerOptions && (
        <TriggerModal
          submitting={triggering}
          onClose={() => setShowTriggerOptions(false)}
          onConfirm={handleTrigger}
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TimeAgo({ iso }: { iso: string }) {
  const t = useTranslations("backups");
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return <>{t("timeAgo.justNow")}</>;
  if (mins < 60) return <>{t("timeAgo.minutes", { count: mins })}</>;
  const hours = Math.round(mins / 60);
  if (hours < 24) return <>{t("timeAgo.hours", { count: hours })}</>;
  return <>{t("timeAgo.days", { count: Math.round(hours / 24) })}</>;
}

const STATUS_STYLE: Record<ComponentStatus, { bg: string; fg: string }> = {
  ok: { bg: "#f0fdf4", fg: "#16a34a" },
  failed: { bg: "#fef2f2", fg: "#dc2626" },
  skipped: { bg: "#f1f5f9", fg: "#64748b" },
  excluded: { bg: "#f1f5f9", fg: "#94a3b8" },
};

function ComponentBadges({ manifest }: { manifest: Manifest }) {
  const t = useTranslations("backups");
  return (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
      {componentBadges(manifest).map(({ label, status }) => (
        <span
          key={label}
          title={t(`componentStatus.${status}`, { label })}
          style={{
            fontSize: "0.7rem",
            padding: "0.1rem 0.4rem",
            borderRadius: 4,
            background: STATUS_STYLE[status].bg,
            color: STATUS_STYLE[status].fg,
          }}
        >
          {label}
        </span>
      ))}
      {manifest.source === "uploaded" && (
        <span className={styles.muted} style={{ fontSize: "0.7rem" }}>
          {t("detectedNotVerified")}
        </span>
      )}
    </div>
  );
}

function BackupRow({
  manifest,
  onRestore,
  onDownload,
  onDelete,
  downloading,
  disabled,
}: {
  manifest: Manifest;
  onRestore: (m: Manifest) => void;
  onDownload: (m: Manifest) => void;
  onDelete: (m: Manifest) => void;
  downloading?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("backups");
  return (
    <div className={styles.tableWrap} style={{ padding: "1rem 1.25rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <span className={styles.code}>{manifest.file}</span>
          <div className={styles.muted} style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
            {formatDate(manifest.date)} (<TimeAgo iso={manifest.date} />) ·{" "}
            {formatBytes(manifest.sizeBytes)} · {manifest.trigger}
          </div>
        </div>
        <ComponentBadges manifest={manifest} />
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            className={styles.actionBtn}
            onClick={() => onDownload(manifest)}
            disabled={downloading}
          >
            {downloading ? t("downloadingEllipsis") : t("download")}
          </button>
          <button
            className={`${styles.actionBtn} ${styles.primaryBtn}`}
            onClick={() => onRestore(manifest)}
            disabled={disabled}
          >
            {t("restore")}
          </button>
          <button
            className={styles.actionBtn}
            style={{ color: "#dc2626" }}
            onClick={() => onDelete(manifest)}
            disabled={disabled}
          >
            {t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RestoreModal({
  manifest,
  token,
  onClose,
  onStarted,
}: {
  manifest: Manifest;
  token: string;
  onClose: () => void;
  onStarted: () => void;
}) {
  const t = useTranslations("backups");
  const [typedFilename, setTypedFilename] = useState("");
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const [restoreKeycloak, setRestoreKeycloak] = useState(manifest.source !== "uploaded");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const failedComponents = componentBadges(manifest)
    .filter((c) => c.status === "failed")
    .map((c) => c.label);
  const hasWarnings = failedComponents.length > 0;
  const canSubmit =
    typedFilename === manifest.file && (!hasWarnings || acknowledgeWarnings) && !submitting;

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      const { token: restoreToken } = await apiFetch(
        `${BASE}/${manifest.file}/restore-token`,
        token,
        { method: "POST" }
      );
      await apiFetch(`${BASE}/${manifest.file}/restore`, token, {
        method: "POST",
        body: JSON.stringify({
          confirmFilename: manifest.file,
          restoreToken,
          acknowledgeWarnings,
          restoreKeycloak,
        }),
      });
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("restoreStartFailed"));
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{t("restoreFromBackup")}</h2>

        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
          }}
        >
          {t.rich("destructiveWarning", {
            strong: (chunks) => <strong>{chunks}</strong>,
            keycloak: restoreKeycloak ? "yes" : "no",
          })}
        </div>

        <p style={{ marginBottom: "0.75rem" }}>
          {t("restoring")} <span className={styles.code}>{manifest.file}</span>
        </p>

        {hasWarnings && (
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              fontSize: "0.85rem",
            }}
          >
            {t.rich("knownIssuesWarning", {
              strong: (chunks) => <strong>{chunks}</strong>,
              components: failedComponents.join(", "),
            })}
            <ToggleSwitch
              className={styles.checkboxLabel}
              wrapperStyle={{ marginTop: "0.5rem" }}
              checked={acknowledgeWarnings}
              onChange={(e) => setAcknowledgeWarnings(e.target.checked)}
              label={t("restoreAnyway")}
            />
          </div>
        )}

        {manifest.source === "uploaded" && (
          <ToggleSwitch
            className={styles.checkboxLabel}
            wrapperStyle={{ marginBottom: "1rem" }}
            checked={restoreKeycloak}
            onChange={(e) => setRestoreKeycloak(e.target.checked)}
            label={t("reimportKeycloakLabel")}
          />
        )}

        <label
          style={{
            display: "block",
            marginBottom: "0.5rem",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          {t("typeFilenameToConfirm")}
        </label>
        <input
          className={styles.input}
          style={{ width: "100%", marginBottom: "1rem" }}
          value={typedFilename}
          onChange={(e) => setTypedFilename(e.target.value)}
          placeholder={manifest.file}
        />

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.formActions}>
          <button className={styles.cancelButton} onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </button>
          <button
            className={styles.saveButton}
            style={{ background: "#dc2626" }}
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            {submitting ? t("startingRestoreEllipsis") : t("restore")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({
  manifest,
  token,
  onClose,
  onDeleted,
}: {
  manifest: Manifest;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("backups");
  const [typedFilename, setTypedFilename] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = typedFilename === manifest.file && !submitting;

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`${BASE}/${manifest.file}`, token, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{t("deleteBackup")}</h2>

        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
          }}
        >
          {t.rich("deleteWarning", { strong: (chunks) => <strong>{chunks}</strong> })}
        </div>

        <p style={{ marginBottom: "0.75rem" }}>
          <span className={styles.code}>{manifest.file}</span>
        </p>

        <label
          style={{
            display: "block",
            marginBottom: "0.5rem",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          {t("typeFilenameToConfirm")}
        </label>
        <input
          className={styles.input}
          style={{ width: "100%", marginBottom: "1rem" }}
          value={typedFilename}
          onChange={(e) => setTypedFilename(e.target.value)}
          placeholder={manifest.file}
        />

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.formActions}>
          <button className={styles.cancelButton} onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </button>
          <button
            className={styles.saveButton}
            style={{ background: "#dc2626" }}
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            {submitting ? t("deletingEllipsis") : t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TriggerModal({
  submitting,
  onClose,
  onConfirm,
}: {
  submitting: boolean;
  onClose: () => void;
  onConfirm: (services: ServiceSelection) => void;
}) {
  const t = useTranslations("backups");
  // All included by default — matches every backup before this option existed.
  const [mongo, setMongo] = useState(true);
  const [neo4j, setNeo4j] = useState(true);
  const [lightrag, setLightrag] = useState(true);
  const [keycloak, setKeycloak] = useState(true);

  const noneSelected = !mongo && !neo4j && !lightrag && !keycloak;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{t("triggerOptionsTitle")}</h2>
        <p style={{ marginBottom: "1rem", fontSize: "0.9rem" }} className={styles.muted}>
          {t("triggerOptionsSubtitle")}
        </p>

        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}
        >
          <ToggleSwitch
            checked={mongo}
            onChange={(e) => setMongo(e.target.checked)}
            label="Mongo"
          />
          <ToggleSwitch
            checked={neo4j}
            onChange={(e) => setNeo4j(e.target.checked)}
            label="Neo4j"
          />
          <ToggleSwitch
            checked={lightrag}
            onChange={(e) => setLightrag(e.target.checked)}
            label="LightRAG"
          />
          <div>
            <ToggleSwitch
              checked={keycloak}
              onChange={(e) => setKeycloak(e.target.checked)}
              label="Keycloak"
            />
            <p className={styles.muted} style={{ fontSize: "0.75rem", margin: "0.15rem 0 0 3rem" }}>
              {t("keycloakToggleHint")}
            </p>
          </div>
        </div>

        {noneSelected && <p className={styles.error}>{t("noServicesSelected")}</p>}

        <div className={styles.formActions}>
          <button className={styles.cancelButton} onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </button>
          <button
            className={styles.saveButton}
            onClick={() => onConfirm({ mongo, neo4j, lightrag, keycloak })}
            disabled={submitting || noneSelected}
          >
            {submitting ? t("startingEllipsis") : t("startBackup")}
          </button>
        </div>
      </div>
    </div>
  );
}
