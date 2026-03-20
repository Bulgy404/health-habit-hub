"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import styles from "./sidebar.module.css";

const NAV_ITEMS = [
  { href: "/questionnaires", label: "Questionnaires", icon: "📋" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>🏥</span>
        <span className={styles.brandName}>HHH Admin</span>
      </div>

      <nav className={styles.nav}>
        <ul className={styles.navList}>
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.navLink} ${pathname.startsWith(item.href) ? styles.navLinkActive : ""}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.footer}>
        {session?.user?.email && (
          <div className={styles.userEmail}>{session.user.email}</div>
        )}
        <button
          onClick={() => signOut()}
          className={styles.signOutButton}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
