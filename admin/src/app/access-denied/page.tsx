import Link from "next/link";
import styles from "./page.module.css";

export default function AccessDenied() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>🚫</div>
        <h1 className={styles.title}>Access Denied</h1>
        <p className={styles.message}>
          You do not have permission to access the admin panel. Only users with the{" "}
          <strong>admin</strong> or <strong>researcher</strong> role can log in.
        </p>
        <Link href="/api/auth/signout" className={styles.button}>
          Sign out
        </Link>
      </div>
    </div>
  );
}
