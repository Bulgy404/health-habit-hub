import styles from "./page.module.css";

export default function SettingsPage() {
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
