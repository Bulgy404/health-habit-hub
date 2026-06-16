"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  FlaskConical,
  BarChart2,
  Crosshair,
  ClipboardList,
  UserCircle,
  BookOpen,
  Settings,
  LogOut,
  Activity,
  type LucideIcon,
} from "lucide-react";
import styles from "./sidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/studies", label: "Studies", Icon: FlaskConical },
  { href: "/analytics", label: "Analytics", Icon: BarChart2 },
  { href: "/cue-pools", label: "Cue Pools", Icon: Crosshair },
  { href: "/questionnaires", label: "Questionnaires", Icon: ClipboardList },
  { href: "/profile-fields", label: "Profile Fields", Icon: UserCircle, adminOnly: true },
  { href: "/knowledge-base", label: "Knowledge Base", Icon: BookOpen, adminOnly: true },
  { href: "/settings", label: "Settings", Icon: Settings, adminOnly: true },
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
        <Activity size={20} strokeWidth={2} className={styles.brandIcon} />
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
                <item.Icon size={16} strokeWidth={1.75} />
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
              callbackUrl: `${process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL}/realms/hhh/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_NEXTAUTH_URL ?? "")}&client_id=hhh-admin`,
            })
          }
          className={styles.signOutButton}
        >
          <LogOut size={14} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
