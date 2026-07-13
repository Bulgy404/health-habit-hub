"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import {
  FlaskConical,
  BarChart2,
  Crosshair,
  ClipboardList,
  UserCircle,
  BookOpen,
  LogOut,
  Activity,
  Users,
  Tablet,
  Gift,
  MessageSquare,
  Server,
  DatabaseBackup,
  Globe,
  History,
  ShieldAlert,
  UserCog,
  HelpCircle,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { locales, LOCALE_COOKIE, type Locale } from "@/lib/locale";
import { signOutOfKeycloak } from "@/lib/keycloakSignOut";
import { ThemeToggle } from "./theme-toggle";
import styles from "./sidebar.module.css";

interface NavItem {
  href: string;
  labelKey: string;
  Icon: LucideIcon;
  adminOnly?: boolean;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "research",
    items: [
      { href: "/studies", labelKey: "studies", Icon: FlaskConical },
      { href: "/analytics", labelKey: "analytics", Icon: BarChart2 },
    ],
  },
  {
    titleKey: "operations",
    items: [
      { href: "/participants", labelKey: "participants", Icon: Users, adminOnly: true },
      { href: "/devices", labelKey: "devices", Icon: Tablet, adminOnly: true },
      { href: "/donations", labelKey: "donations", Icon: Gift, adminOnly: true },
      { href: "/comments", labelKey: "comments", Icon: MessageSquare, adminOnly: true },
    ],
  },
  {
    titleKey: "configuration",
    items: [
      { href: "/cue-pools", labelKey: "cuePools", Icon: Crosshair },
      { href: "/questionnaires", labelKey: "questionnaires", Icon: ClipboardList },
      { href: "/profile-fields", labelKey: "profileFields", Icon: UserCircle, adminOnly: true },
      { href: "/knowledge-base", labelKey: "knowledgeBase", Icon: BookOpen, adminOnly: true },
    ],
  },
  {
    titleKey: "monitoring",
    items: [
      { href: "/system", labelKey: "system", Icon: Server, adminOnly: true },
      { href: "/backups", labelKey: "backups", Icon: DatabaseBackup, adminOnly: true },
      { href: "/audit-log", labelKey: "auditLog", Icon: History, adminOnly: true },
      {
        href: "/restore-attempts",
        labelKey: "restoreAttempts",
        Icon: ShieldAlert,
        adminOnly: true,
      },
      { href: "/team", labelKey: "team", Icon: UserCog, adminOnly: true },
    ],
  },
  {
    titleKey: "support",
    items: [{ href: "/help", labelKey: "help", Icon: HelpCircle }],
  },
];

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  nl: "Nederlands",
};

/**
 * Fixed-position navigation sidebar showing links to all admin sections.
 * Admin-only items are hidden for non-admin users.
 *
 * @returns The admin navigation sidebar.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations("sidebar");
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = (session?.roles ?? []).includes("admin");

  // Close the drawer automatically on navigation (small-screen use case).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function handleLocaleChange(next: string) {
    // A plain preference cookie, not security-sensitive — set client-side and
    // refresh so the server-rendered tree picks it up (see src/i18n/request.ts).
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax; Secure`;
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setMobileOpen((open) => !open)}
        aria-label={t(mobileOpen ? "closeMenu" : "openMenu")}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      {mobileOpen && (
        <div className={styles.backdrop} onClick={() => setMobileOpen(false)} aria-hidden />
      )}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <Activity size={20} strokeWidth={2} className={styles.brandIcon} />
          <span className={styles.brandName}>{t("brand")}</span>
        </div>

        <nav className={styles.nav}>
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((item) => !item.adminOnly || isAdmin);
            if (visible.length === 0) return null;
            return (
              <div key={section.titleKey} className={styles.navSection}>
                <div className={styles.navSectionTitle}>{t(`sections.${section.titleKey}`)}</div>
                <ul className={styles.navList}>
                  {visible.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`${styles.navLink} ${pathname.startsWith(item.href) ? styles.navLinkActive : ""}`}
                      >
                        <item.Icon size={16} strokeWidth={1.75} />
                        {t(`nav.${item.labelKey}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className={styles.footer}>
          {session?.user?.email && <div className={styles.userEmail}>{session.user.email}</div>}
          <div className={styles.langSwitcher}>
            <Globe size={14} strokeWidth={1.75} />
            <select
              aria-label={t("language")}
              value={locale}
              onChange={(e) => handleLocaleChange(e.target.value)}
              className={styles.langSelect}
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
          <ThemeToggle label={t("toggleTheme")} />
          <button onClick={signOutOfKeycloak} className={styles.signOutButton}>
            <LogOut size={14} strokeWidth={1.75} />
            {t("signOut")}
          </button>
        </div>
      </aside>
    </>
  );
}
