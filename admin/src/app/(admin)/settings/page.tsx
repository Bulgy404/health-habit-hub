"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.roles?.includes('admin')) {
      router.replace('/access-denied');
    }
  }, [session, status, router]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>System configuration and platform settings.</p>
      </div>
      <div className={styles.placeholder}>
        <span className={styles.placeholderIcon}>⚙️</span>
        <p>Settings panel coming soon.</p>
      </div>
    </div>
  );
}
