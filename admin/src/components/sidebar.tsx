"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import styles from "./sidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/studies", label: "Studies", icon: "🔬" },
  { href: "/cue-pools", label: "Cue Pools", icon: "🎯" },
  { href: "/questionnaires", label: "Questionnaires", icon: "📋" },
  { href: "/profile-fields", label: "Profile Fields", icon: "👤", adminOnly: true },
  { href: "/knowledge-base", label: "Knowledge Base", icon: "📚", adminOnly: true },
  { href: "/settings", label: "Settings", icon: "⚙️", adminOnly: true },
];

/**
 * Fixed-position navigation sidebar showing links to all admin sections.
 * Admin-only items are hidden for non-admin users.
 *
 * @returns The admin navigation sidebar.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAdmin = (session?.roles ?? []).includes("admin");
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>🏥</span>
        <span className={styles.brandName}>HHH Portal</span>
      </div>

      <nav className={styles.nav}>
        <ul className={styles.navList}>
          {visibleItems.map((item) => (
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
          onClick={() =>
            signOut({
              // After NextAuth clears its session, redirect to Keycloak's
              // end_session endpoint so the SSO session is also destroyed.
              // Without this the user stays logged in to Keycloak and can
              // re-enter the admin portal without re-entering credentials.
              callbackUrl: `${process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL}/realms/hhh/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_NEXTAUTH_URL ?? "")}&client_id=hhh-admin`,
            })
          }
          className={styles.signOutButton}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
