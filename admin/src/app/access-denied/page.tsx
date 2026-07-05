import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import styles from "./page.module.css";

export default async function AccessDenied() {
  const t = await getTranslations("accessDenied");
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>
          <ShieldOff size={48} strokeWidth={1.5} />
        </div>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.message}>
          {t.rich("message", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <Link href="/api/auth/signout" className={styles.button}>
          {t("signOut")}
        </Link>
      </div>
    </div>
  );
}
