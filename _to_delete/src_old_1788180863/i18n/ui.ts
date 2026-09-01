// Central UI string catalog + route map. Adding a language = add its object
// here and its route entries below, then create the thin page wrappers.

export const locales = ['de', 'en'] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = 'de';

// Canonical page keys → localized URLs. Used for nav + the language switch.
export const routes = {
  home:        { de: '/',              en: '/en/' },
  participants:{ de: '/teilnehmen/',   en: '/en/participate/' },
  research:    { de: '/forschung/',    en: '/en/research/' },
  imprint:     { de: '/impressum/',    en: '/en/legal/imprint/' },
  privacy:     { de: '/datenschutz/',  en: '/en/legal/privacy/' },
  consent:     { de: '/einwilligung/', en: '/en/legal/consent/' },
  accessibility:{ de: '/barrierefreiheit/', en: '/en/legal/accessibility/' },
} as const;
export type PageKey = keyof typeof routes;

// External destinations (the running platform + stores).
export const links = {
  app: 'https://habit.wiwi.tu-dresden.de/',
  admin: 'https://habit.wiwi.tu-dresden.de/admin',
  github: 'https://github.com/Bulgy404/health-habit-hub',
  appStore: 'https://apps.apple.com/de/app/health-habit-hub/id6793165538?l=en-GB',
  playStore: '', // Android — coming soon
};

type Dict = Record<string, string>;

const de: Dict = {
  // nav / chrome
  nav_participants: 'Teilnehmen', nav_research: 'Forschung', nav_about: 'Über das Projekt',
  nav_docs: 'Docs', nav_portal: 'Zum Portal',
  foot_tagline: 'Forschungsplattform für Gesundheitsverhalten. TU Dresden, Fakultät Wirtschaftswissenschaften.',
  foot_h_part: 'Teilnehmende', foot_h_res: 'Forschende', foot_h_legal: 'Rechtliches',
  foot_download: 'App laden', foot_guide: 'Teilnahme-Leitfaden', foot_faq: 'Häufige Fragen',
  foot_admin: 'Admin-Portal', foot_docs: 'Dokumentation', foot_monitoring: 'Monitoring',
  foot_imprint: 'Impressum', foot_privacy: 'Datenschutz', foot_consent: 'Einwilligung', foot_accessibility: 'Barrierefreiheit',

  // home
  home_title: 'Gesündere Gewohnheiten, wissenschaftlich begleitet.',
  home_title_em: 'wissenschaftlich',
  home_lead: 'Health Habit Hub ist eine Forschungsplattform zur Untersuchung von Gesundheitsverhalten — für Teilnehmende und Forschende, in einer Umgebung.',
  home_cta_part: 'Ich möchte teilnehmen', home_cta_res: 'Ich bin Forschende·r',
  meta_devices: 'Auf jedem Gerät', meta_gdpr: 'Datenschutz nach EU-Recht',
  chart_title: 'Gewohnheiten im Verlauf', chart_sub: 'Illustrative Studienkohorte · 12 Wochen',
  chart_badge: '+68% Konsistenz', chart_note: 'Illustrative Darstellung',
  w1: 'Woche 1', w2: 'Woche 6', w3: 'Woche 12',
  what_eyebrow: 'Was ist Health Habit Hub', what_title: 'Eine Plattform, zwei Perspektiven.',
  what_sub: 'Teilnehmende erfassen und reflektieren ihre Gewohnheiten über eine App. Forschende gestalten Studien, begleiten Kohorten und werten Daten datenschutzkonform aus — alles unter einem Dach.',
  c1t: 'Gewohnheiten erfassen', c1p: 'Einfaches, tägliches Tracking in der App — ohne Reibung, mit Fokus auf reale Verhaltensmuster.',
  c2t: 'Studien durchführen', c2p: 'Kohorten anlegen, Interventionen steuern und Verläufe auswerten — über das Forschungs-Portal.',
  c3t: 'Datenschutz zuerst', c3p: 'SSO über Keycloak, Rollentrennung und DSGVO-konforme Speicherung — Vertrauen ist Grundlage.',
  fork_eyebrow: 'Wähle deinen Weg', fork_title: 'Bist du Teilnehmende·r — oder Forschende·r?',
  fork_sub: 'Beide starten hier. Der Weg dahinter ist auf dich zugeschnitten.',
  fork_p_q: 'Bist du hier, um mitzumachen?', fork_p_t: 'Für Teilnehmende',
  fork_p_p: 'Nimm an einer Studie teil, verfolge deine Gewohnheiten und behalte die Kontrolle über deine Daten.',
  fork_p_go: 'Als Teilnehmende·r starten',
  fork_r_q: 'Leitest du eine Studie?', fork_r_t: 'Für Forschende',
  fork_r_p: 'Gestalte Studien, verwalte Kohorten und werte Daten aus — über das Admin-Portal und die Doku.',
  fork_r_go: 'Zum Forschungs-Portal',
  trust_eyebrow: 'Wissenschaftlicher Kontext', trust_title: 'Entwickelt an der TU Dresden.',
  trust_p: 'Health Habit Hub entsteht in der Fakultät Wirtschaftswissenschaften und wird auf einer eigenen, kontrollierten Infrastruktur betrieben — für reproduzierbare, datenschutzkonforme Gesundheitsforschung.',
  trust_btn: 'Zum Admin-Portal',

  // participants
  p_hero_title: 'Verfolge deine Gewohnheiten — und trag zur Forschung bei.',
  p_hero_lead: 'Die Health-Habit-Hub-App macht aus kleinen täglichen Schritten sichtbare Muster. Kostenlos, datenschutzkonform, Teil echter Wissenschaft.',
  p_ios: 'Im App Store laden', p_android_soon: 'Android — bald verfügbar',
  p_web: 'Im Browser öffnen',
  p_s1_t: 'In einem Screen erklärt', p_s1_p: 'Kein dichtes Onboarding, kein langes Signup — nur ein klares Versprechen und ein Weg hinein.',
  p_s2_t: 'Sieh, wie Gewohnheiten automatisch werden', p_s2_p: 'Ein Kalender-Heatmap zeigt deine Konsistenz auf einen Blick; Erinnerungen verschwinden von selbst, sobald eine Gewohnheit sitzt.',
  p_s3_t: 'Der gemeinsame Habit-Graph', p_s3_p: 'Durchstöbere die Gewohnheiten, die andere Teilnehmende gespendet haben — in einer interaktiven Bubble-Graph-Ansicht. Verwandte Verhaltensweisen gruppieren sich, du kannst schwenken, zoomen und dich durchtippen.',
  p_s4_t: 'Keine generischen Tipps. Deine.', p_s4_p: 'Vorschläge auf Basis der Verhaltenswissenschaft — jeder mit verständlicher Begründung und einem Tipp, um ihn direkt zu übernehmen.',
  p_s5_t: 'Gewohnheitsstärke, wissenschaftlich gemessen', p_s5_p: 'Der Self-Report Habit Index (SRHI) und ein Automatismus-Score jeder Gewohnheit werden über die Studie verfolgt — so wird aus Vorsatz sichtbare Routine.',
  p_how_eyebrow: 'So machst du mit', p_how_title: 'In drei Schritten dabei.',
  p_how_1_t: 'App laden', p_how_1_p: 'Lade die App aus dem App Store (Android folgt bald) oder öffne sie im Browser.',
  p_how_2_t: 'Einwilligen', p_how_2_p: 'Lies die Einwilligung und den Teilnahme-Leitfaden — transparent, jederzeit widerrufbar.',
  p_how_3_t: 'Tracken', p_how_3_p: 'Erfasse deine Gewohnheiten und sieh deinen Fortschritt wachsen.',
  p_trust_t: 'Deine Daten, deine Kontrolle', p_trust_p: 'Anmeldung über abgesichertes SSO, Speicherung nach DSGVO auf europäischer Infrastruktur. Was mit deinen Daten passiert, steht klar in der Datenschutzerklärung und der Einwilligung.',
  p_guide: 'Teilnahme-Leitfaden', p_consent_link: 'Einwilligung lesen',

  // research
  r_hero_title: 'Führe die ganze Studie über ein Dashboard.',
  r_hero_lead: 'Health Habit Hub gibt Forschenden die Werkzeuge, um Studien zu gestalten, Kohorten zu begleiten und Daten datenschutzkonform auszuwerten — ohne je eine Datenbank anzufassen.',
  r_admin_btn: 'Zum Admin-Portal', r_docs_btn: 'Dokumentation',
  r_shot_cap: 'Studien, Fragebögen und die geteilte Wissensbasis konfigurieren, Fortschritt verfolgen und Daten exportieren — alles, was Forschende und Admins brauchen.',
  r_cap_eyebrow: 'Funktionen', r_cap_title: 'Was das Portal kann.',
  r_cap_1_t: 'Studien & Kohorten', r_cap_1_p: 'Studien anlegen, Teilnehmende in Kohorten organisieren und Interventionen steuern.',
  r_cap_2_t: 'Fragebögen & SRHI', r_cap_2_p: 'Standardisierte Instrumente inkl. Self-Report Habit Index über den Studienverlauf.',
  r_cap_3_t: 'Wissensbasis & Empfehlungen', r_cap_3_p: 'Geteilte Wissensbasis, die den Empfehlungsdienst für Teilnehmende speist.',
  r_cap_4_t: 'Datenexport', r_cap_4_p: 'Strukturierte Exporte für die Auswertung — ohne direkten Datenbankzugriff.',
  r_cap_5_t: 'Monitoring', r_cap_5_p: 'Betriebszustand und Kennzahlen über Grafana im Blick behalten.',
  r_cap_6_t: 'Rollen & SSO', r_cap_6_p: 'Rollentrennung über Keycloak — Admin, Forschende, Teilnehmende sauber getrennt.',
  r_arch_eyebrow: 'Architektur', r_arch_title: 'Auf eigener, kontrollierter Infrastruktur.',
  r_arch_p: 'Flutter-App und Web, eine Node-API, Keycloak-SSO, MongoDB und Neo4j sowie ein Empfehlungsdienst — hinter Traefik mit TLS, betrieben auf dem Server der TU Dresden.',
  r_arch_app: 'App · iOS / Android / Web', r_arch_api: 'Node-API', r_arch_auth: 'Keycloak SSO',
  r_arch_data: 'MongoDB · Neo4j', r_arch_rec: 'Empfehlungsdienst', r_arch_edge: 'Traefik · TLS · TU Dresden',
  r_get_t: 'Eine Studie durchführen?', r_get_p: 'Von der Studienplanung bis zum Datenexport begleitet dich die Dokumentation. Für Zugang oder eine neue Studie nimm Kontakt auf.',
  r_get_docs: 'Zur Dokumentation', r_get_github: 'Auf GitHub ansehen',

  soon: 'Bald',
};

const en: Dict = {
  nav_participants: 'Take part', nav_research: 'Research', nav_about: 'About',
  nav_docs: 'Docs', nav_portal: 'Go to portal',
  foot_tagline: 'Research platform for health behaviour. TU Dresden, Faculty of Business and Economics.',
  foot_h_part: 'Participants', foot_h_res: 'Researchers', foot_h_legal: 'Legal',
  foot_download: 'Download the app', foot_guide: 'Participation guide', foot_faq: 'FAQ',
  foot_admin: 'Admin portal', foot_docs: 'Documentation', foot_monitoring: 'Monitoring',
  foot_imprint: 'Imprint', foot_privacy: 'Privacy', foot_consent: 'Consent', foot_accessibility: 'Accessibility',

  home_title: 'Healthier habits, scientifically guided.',
  home_title_em: 'scientifically',
  home_lead: 'Health Habit Hub is a research platform for studying health behaviour — for participants and researchers, in one place.',
  home_cta_part: 'I want to take part', home_cta_res: "I'm a researcher",
  meta_devices: 'On every device', meta_gdpr: 'Privacy under EU law',
  chart_title: 'Habits over time', chart_sub: 'Illustrative study cohort · 12 weeks',
  chart_badge: '+68% consistency', chart_note: 'Illustrative',
  w1: 'Week 1', w2: 'Week 6', w3: 'Week 12',
  what_eyebrow: 'What Health Habit Hub is', what_title: 'One platform, two perspectives.',
  what_sub: 'Participants record and reflect on their habits through an app. Researchers design studies, guide cohorts and analyse data in a privacy-compliant way — all under one roof.',
  c1t: 'Track habits', c1p: 'Simple daily tracking in the app — frictionless, focused on real behaviour patterns.',
  c2t: 'Run studies', c2p: 'Create cohorts, steer interventions and analyse trajectories — via the research portal.',
  c3t: 'Privacy first', c3p: 'SSO via Keycloak, role separation and GDPR-compliant storage — trust is the foundation.',
  fork_eyebrow: 'Choose your path', fork_title: 'Are you a participant — or a researcher?',
  fork_sub: 'Both start here. What comes next is tailored to you.',
  fork_p_q: 'Here to take part?', fork_p_t: 'For participants',
  fork_p_p: 'Join a study, track your habits and stay in control of your data.',
  fork_p_go: 'Start as a participant',
  fork_r_q: 'Running a study?', fork_r_t: 'For researchers',
  fork_r_p: 'Design studies, manage cohorts and analyse data — via the admin portal and docs.',
  fork_r_go: 'Go to the research portal',
  trust_eyebrow: 'Scientific context', trust_title: 'Built at TU Dresden.',
  trust_p: 'Health Habit Hub is developed in the Faculty of Business and Economics and runs on its own controlled infrastructure — for reproducible, privacy-compliant health research.',
  trust_btn: 'Go to admin portal',

  p_hero_title: 'Track your habits — and contribute to research.',
  p_hero_lead: 'The Health Habit Hub app turns small daily steps into visible patterns. Free, privacy-compliant, and part of real science.',
  p_ios: 'Download on the App Store', p_android_soon: 'Android — coming soon',
  p_web: 'Open in browser',
  p_s1_t: 'Explained in one screen', p_s1_p: 'No dense onboarding, no lengthy signup — just a clear promise and a way in.',
  p_s2_t: 'Watch your habits become automatic', p_s2_p: 'A calendar heatmap shows your consistency at a glance, and reminders fade out automatically once a habit sticks.',
  p_s3_t: 'The shared habit graph', p_s3_p: 'Browse the habits other participants have donated in an interactive bubble-graph view. Related behaviours cluster together, so you can pan, zoom, and tap through the collective picture.',
  p_s4_t: 'Not generic advice. Yours.', p_s4_p: 'Suggestions grounded in behavioural science, each with a plain-language rationale and a one-tap way to add it to your own habits.',
  p_s5_t: 'Habit strength, measured scientifically', p_s5_p: "Each habit's Self-Report Habit Index (SRHI) and automaticity score are tracked across the study, so you can see your own progress becoming routine.",
  p_how_eyebrow: 'How to take part', p_how_title: 'Join in three steps.',
  p_how_1_t: 'Get the app', p_how_1_p: 'Download from the App Store (Android coming soon) or open it in your browser.',
  p_how_2_t: 'Consent', p_how_2_p: 'Read the consent and participation guide — transparent, revocable at any time.',
  p_how_3_t: 'Track', p_how_3_p: 'Record your habits and watch your progress grow.',
  p_trust_t: 'Your data, your control', p_trust_p: 'Sign-in via secured SSO, storage under GDPR on European infrastructure. What happens with your data is spelled out in the privacy policy and consent.',
  p_guide: 'Participation guide', p_consent_link: 'Read the consent',

  r_hero_title: 'Run the whole study from one dashboard.',
  r_hero_lead: 'Health Habit Hub gives researchers the tools to design studies, guide cohorts and analyse data in a privacy-compliant way — without ever touching a database.',
  r_admin_btn: 'Go to admin portal', r_docs_btn: 'Documentation',
  r_shot_cap: 'Configure studies, questionnaires and the shared knowledge base, track progress and export data — everything researchers and admins need.',
  r_cap_eyebrow: 'Capabilities', r_cap_title: 'What the portal does.',
  r_cap_1_t: 'Studies & cohorts', r_cap_1_p: 'Create studies, organise participants into cohorts and steer interventions.',
  r_cap_2_t: 'Questionnaires & SRHI', r_cap_2_p: 'Standardised instruments incl. the Self-Report Habit Index across the study.',
  r_cap_3_t: 'Knowledge base & recommendations', r_cap_3_p: 'A shared knowledge base that feeds the recommender for participants.',
  r_cap_4_t: 'Data export', r_cap_4_p: 'Structured exports for analysis — with no direct database access.',
  r_cap_5_t: 'Monitoring', r_cap_5_p: 'Keep operational health and metrics in view via Grafana.',
  r_cap_6_t: 'Roles & SSO', r_cap_6_p: 'Role separation via Keycloak — admin, researcher and participant cleanly split.',
  r_arch_eyebrow: 'Architecture', r_arch_title: 'On its own controlled infrastructure.',
  r_arch_p: 'A Flutter app and web client, a Node API, Keycloak SSO, MongoDB and Neo4j, and a recommender — behind Traefik with TLS, operated on the TU Dresden server.',
  r_arch_app: 'App · iOS / Android / Web', r_arch_api: 'Node API', r_arch_auth: 'Keycloak SSO',
  r_arch_data: 'MongoDB · Neo4j', r_arch_rec: 'Recommender', r_arch_edge: 'Traefik · TLS · TU Dresden',
  r_get_t: 'Running a study?', r_get_p: 'From study design to data export, the documentation guides you. For access or a new study, get in touch.',
  r_get_docs: 'Read the docs', r_get_github: 'View on GitHub',

  soon: 'Soon',
};

const dicts: Record<Lang, Dict> = { de, en };

export function useT(lang: Lang) {
  const d = dicts[lang] ?? de;
  return (key: string) => d[key] ?? de[key] ?? key;
}

export function otherLang(lang: Lang): Lang {
  return lang === 'de' ? 'en' : 'de';
}
