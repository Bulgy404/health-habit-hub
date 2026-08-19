"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl, API_BASE_URL } from "@/lib/api";
import { Modal } from "@/components/modal";
import styles from "@/components/admin-page.module.css";

interface AudioClip {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
}

interface QuestionnaireResponse {
  questionnaireSlug: string;
  answers: Record<string, unknown>;
  submittedAt: string;
}

interface SelfReport {
  frequency: string | null;
  duration: string | null;
  healthBenefit: string | null;
  wellbeingImpact: string | null;
}

interface DonationDetail {
  uuid: string;
  userId: string;
  inputMode: string;
  isHabit: boolean | null;
  transcript: string | null;
  audioClip: AudioClip | null;
  questionnaireSlug: string | null;
  questionnaireResponse: QuestionnaireResponse | null;
  selfReport: SelfReport | null;
  createdAt: string | null;
}

interface DonationDetailModalProps {
  uuid: string;
  token: string;
  onClose: () => void;
}

/**
 * Detail view for one habit donation: voice transcript, inline audio
 * playback + download, the linked post-donation questionnaire response, and
 * (for accepted habits) the self-report answers from the donation form
 * itself. Audio is fetched as an authenticated blob (the backend route
 * requires the same bearer token as every other admin call) rather than
 * pointed at directly as an <audio src>, matching how the CSV export on the
 * parent page already handles authenticated binary downloads.
 */
export function DonationDetailModal({ uuid, token, onClose }: DonationDetailModalProps) {
  const t = useTranslations("donations");
  const [detail, setDetail] = useState<DonationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<DonationDetail>(apiUrl(`/admin/habit-donations/${uuid}`), token)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("detailLoadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, token]);

  useEffect(() => {
    if (!detail?.audioClip) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    fetch(`${API_BASE_URL}/admin/habit-donations/${uuid}/audio`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(t("audioLoadFailed"));
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setAudioError(e instanceof Error ? e.message : t("audioLoadFailed"));
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.audioClip, uuid, token]);

  async function handleDownload() {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/habit-donations/${uuid}/audio?download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(t("audioLoadFailed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = detail?.audioClip?.filename ?? `${uuid}.audio`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : t("audioLoadFailed"));
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={640}>
      <h2 className={styles.modalTitle}>{t("detailTitle")}</h2>

      {loading && <p className={styles.muted}>{t("detailLoading")}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {detail && (
        <>
          <div className={styles.detailSection}>
            <span className={styles.detailLabel}>{t("detailUuid")}</span>
            <span className={styles.code}>{detail.uuid}</span>
          </div>

          <div className={styles.detailSection}>
            <span className={styles.detailLabel}>{t("detailParticipant")}</span>
            <span className={styles.code}>{detail.userId}</span>
          </div>

          {detail.inputMode === "voice" && (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{t("detailTranscript")}</span>
              {detail.transcript ? (
                <p className={styles.detailText}>{detail.transcript}</p>
              ) : (
                <p className={styles.muted}>{t("detailNoTranscript")}</p>
              )}
            </div>
          )}

          {detail.audioClip && (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{t("detailAudio")}</span>
              {audioError && <p className={styles.error}>{audioError}</p>}
              {audioUrl ? (
                <audio controls src={audioUrl} style={{ width: "100%" }} />
              ) : (
                !audioError && <p className={styles.muted}>{t("audioLoading")}</p>
              )}
              <div style={{ marginTop: "0.5rem" }}>
                <button className={styles.actionBtn} onClick={handleDownload}>
                  {t("downloadAudio")}
                </button>
              </div>
            </div>
          )}

          {detail.selfReport && (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{t("detailSelfReport")}</span>
              <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {detail.selfReport.frequency != null && (
                  <li>
                    {t("selfReportFrequency")}: {String(detail.selfReport.frequency)}
                  </li>
                )}
                {detail.selfReport.duration != null && (
                  <li>
                    {t("selfReportDuration")}: {String(detail.selfReport.duration)}
                  </li>
                )}
                {detail.selfReport.healthBenefit != null && (
                  <li>
                    {t("selfReportHealthBenefit")}: {String(detail.selfReport.healthBenefit)}
                  </li>
                )}
                {detail.selfReport.wellbeingImpact != null && (
                  <li>
                    {t("selfReportWellbeing")}: {String(detail.selfReport.wellbeingImpact)}
                  </li>
                )}
              </ul>
            </div>
          )}

          {detail.questionnaireResponse && (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>
                {t("detailQuestionnaire", { slug: detail.questionnaireResponse.questionnaireSlug })}
              </span>
              <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {Object.entries(detail.questionnaireResponse.answers).map(([key, value]) => (
                  <li key={key}>
                    <span className={styles.code}>{key}</span>: {String(value)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!detail.audioClip && !detail.questionnaireResponse && !detail.selfReport && detail.inputMode !== "voice" && (
            <p className={styles.muted}>{t("detailNoExtras")}</p>
          )}
        </>
      )}

      <div className={styles.formActions}>
        <button className={styles.secondaryButton} onClick={onClose}>
          {t("detailClose")}
        </button>
      </div>
    </Modal>
  );
}
