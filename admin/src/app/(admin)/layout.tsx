import { Sidebar } from "@/components/sidebar";
import { LegalFooter } from "@/components/legal-footer";
import styles from "./layout.module.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        {children}
        <LegalFooter />
      </main>
    </div>
  );
}
