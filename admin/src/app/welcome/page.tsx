"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, Compass, Rocket } from "lucide-react";
import { WELCOME_COOKIE, WELCOME_COOKIE_MAX_AGE } from "@/lib/welcome";
import styles from "./page.module.css";

const STEP_ICONS = [Sparkles, Compass, Rocket];

function markOnboarded() {
  document.cookie = `${WELCOME_COOKIE}=1; path=/; max-age=${WELCOME_COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
}

/**
 * First-run onboarding shown once (gated by the hhh_onboarded cookie, see
 * app/page.tsx) before a new admin user lands on the Studies page.
 */
export default function WelcomePage() {
  const t = useTranslations("welcome");
  const router = useRouter();
  const [step, setStep] = useState(0);

  const isLast = step === STEP_ICONS.length - 1;
  const Icon = STEP_ICONS[step];

  function finish() {
    markOnboarded();
    router.replace("/studies");
  }

  function handleNext() {
    if (isLast) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>
          <Icon size={48} strokeWidth={1.5} />
        </div>
        <h1 className={styles.title}>{t(`steps.${step}.title`)}</h1>
        <p className={styles.message}>{t(`steps.${step}.description`)}</p>

        <div className={styles.dots}>
          {STEP_ICONS.map((_, i) => (
            <span
              key={i}
              className={i === step ? `${styles.dot} ${styles.dotActive}` : styles.dot}
            />
          ))}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.skipButton} onClick={finish}>
            {t("skip")}
          </button>
          <div className={styles.rightActions}>
            {step > 0 && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setStep((s) => s - 1)}
              >
                {t("back")}
              </button>
            )}
            <button type="button" className={styles.button} onClick={handleNext}>
              {isLast ? t("getStarted") : t("next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
