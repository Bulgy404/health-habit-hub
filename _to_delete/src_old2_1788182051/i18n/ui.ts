// Central UI string catalog + route map. Adding a language = add its object
// here and its route entries below, then create the thin page wrappers.

export const locales = ['de', 'en'] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = 'de';

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

export const links = {
  app: 'https://habit.wiwi.tu-dresden.de/',
  admin: 'https://habit.wiwi.tu-dresden.de/admin',
  github: 'https://github.com/Bulgy404/health-habit-hub',
  appStore: 'https://apps.apple.com/de/app/health-habit-hub/id6793165538?l=en-GB',
  playStore: '', // Android, coming soon
  contactEmail: 'digital-health@tu-dresden.de',
};

type Dict = Record<string, string>;

const de: Dict = {
  // nav / chrome
  nav_participants: 'Teilnehmen', nav_research: 'Forschung', nav_github: 'GitHub', nav_portal: 'Zum Portal',
  foot_tagline: 'Eine Forschungsplattform für gesündere Gewohnheiten, entwickelt an der TU Dresden.',
  foot_h_part: 'Teilnehmende', foot_h_res: 'Forschende', foot_h_legal: 'Rechtliches',
  foot_download: 'App laden', foot_guide: 'Teilnahme-Leitfaden', foot_faq: 'Häufige Fragen',
  foot_admin: 'Admin-Portal', foot_docs: 'Dokumentation', foot_contact: 'Kontakt',
  foot_imprint: 'Impressum', foot_privacy: 'Datenschutz', foot_consent: 'Einwilligung', foot_accessibility: 'Barrierefreiheit',

  // home hero
  home_title: 'Kleine Gewohnheiten. Echte Wissenschaft.',
  home_title_em: 'Echte Wissenschaft',
  home_lead: 'Health Habit Hub hilft Menschen, gesündere Gewohnheiten aufzubauen, und hilft Forschenden zu verstehen, wie das gelingt. Beides passiert am selben Ort: eine App zum Mitmachen und ein Portal für die Studienleitung.',
  home_cta_part: 'Ich möchte teilnehmen', home_cta_res: 'Ich forsche',
  meta_devices: 'Verfügbar für iOS & Android',
  meta_gdpr: 'Daten bleiben in Europa, nach DSGVO',
  meta_open: 'Offen und nachvollziehbar',

  // hero growth graph
  chart_title: 'Wie eine Gewohnheit wächst',
  chart_sub: 'Wenn sich Verhalten wiederholt, wird es zur Routine. Genau das macht die App über Wochen sichtbar.',
  chart_note: 'Illustrative Darstellung eines typischen Verlaufs.',
  w1: 'Woche 1', w2: 'Woche 6', w3: 'Woche 12',
  chart_y_low: 'bewusste Anstrengung', chart_y_high: 'automatische Routine',

  // what it is (two perspectives)
  what_eyebrow: 'Die Idee dahinter',
  what_title: 'Eine Plattform, zwei Blickwinkel.',
  what_sub: 'Die meisten Gesundheits-Apps sammeln Daten, ohne dass jemand daraus lernt. Und die meiste Verhaltensforschung erreicht nie eine echte App. Health Habit Hub verbindet beides. Teilnehmende bekommen ein einfaches Werkzeug, um ihre Gewohnheiten zu verfolgen. Forschende bekommen sauber erhobene, anonymisierte Daten, um zu verstehen, was Menschen wirklich hilft. Jede Seite macht die andere besser.',
  what_side_p_t: 'Für Teilnehmende', what_side_p_p: 'ein ruhiges, alltagstaugliches Werkzeug statt noch einer lauten App.',
  what_side_r_t: 'Für Forschende', what_side_r_p: 'reale Verhaltensdaten aus dem Alltag statt nur aus dem Labor.',

  // the shared habit graph (neo4j viz)
  graph_eyebrow: 'Der gemeinsame Wissensschatz',
  graph_title: 'Aus vielen Gewohnheiten wird ein Netzwerk.',
  graph_sub: 'Teilnehmende können ihre Gewohnheiten anonym „spenden“. So entsteht nach und nach ein Graph aus tausenden echten Verhaltensweisen, in dem verwandte Gewohnheiten zusammenrücken. Für Forschende ist das eine Landkarte menschlichen Verhaltens. Für Teilnehmende ist es ein Ort, an dem sie sehen, dass sie nicht allein sind.',
  graph_hint: 'Fahre über einen Knoten, um verwandte Gewohnheiten zu sehen.',
  graph_c1: 'Bewegung', graph_c2: 'Ernährung', graph_c3: 'Schlaf', graph_c4: 'Achtsamkeit',

  // fork
  fork_eyebrow: 'Womit fängst du an?',
  fork_title: 'Bist du hier, um mitzumachen oder um zu forschen?',
  fork_sub: 'Beide Wege starten hier. Dahinter wartet genau das, was du brauchst.',
  fork_p_q: 'Du willst deine Gewohnheiten aufbauen',
  fork_p_t: 'Für Teilnehmende',
  fork_p_p: 'Lade die App, verfolge deine Gewohnheiten und behalte jederzeit die Kontrolle über deine Daten. Nebenbei trägst du zur Forschung bei, ganz freiwillig.',
  fork_p_go: 'Zur Teilnahme',
  fork_r_q: 'Du planst oder leitest eine Studie',
  fork_r_t: 'Für Forschende',
  fork_r_p: 'Gestalte Studien, begleite Kohorten und werte Daten datenschutzkonform aus, ohne jemals eine Datenbank von Hand anzufassen.',
  fork_r_go: 'Zur Forschung',

  // participants page
  p_hero_title: 'Verfolge deine Gewohnheiten, und trag ganz nebenbei zur Forschung bei.',
  p_hero_lead: 'Die Health-Habit-Hub-App macht aus kleinen täglichen Schritten sichtbare Muster. Sie ist kostenlos, geht sorgsam mit deinen Daten um, und jeder Eintrag hilft der Wissenschaft, gesunde Gewohnheiten besser zu verstehen.',
  p_ios: 'Im App Store laden', p_android_soon: 'Für Android bald verfügbar',
  p_web: 'Lieber direkt im Browser starten',
  p_s1_t: 'In einem Screen erklärt',
  p_s1_p: 'Kein langes Onboarding, keine endlosen Formulare. Ein klares Versprechen, ein Weg hinein, und in einer Minute bist du dabei.',
  p_s2_t: 'Sieh zu, wie Gewohnheiten selbstverständlich werden',
  p_s2_p: 'Ein Kalender zeigt dir auf einen Blick, wie konsequent du warst. Erinnerungen werden von selbst leiser, sobald eine Gewohnheit sitzt, damit die App dich nicht ewig bevormundet.',
  p_s3_t: 'Du bist nicht allein unterwegs',
  p_s3_p: 'Im gemeinsamen Habit-Graph siehst du Gewohnheiten, die andere Teilnehmende anonym geteilt haben. Verwandtes gruppiert sich, du kannst schwenken, zoomen und dich durchtippen, und entdeckst, wo deine eigenen Gewohnheiten hineinpassen.',
  p_s4_t: 'Vorschläge, die zu dir passen',
  p_s4_p: 'Statt allgemeiner Ratschläge bekommst du Ideen aus der Verhaltenswissenschaft, jede mit einer verständlichen Begründung und einem Tipp, um sie direkt auszuprobieren.',
  p_s5_t: 'Fortschritt, den man messen kann',
  p_s5_p: 'Für jede Gewohnheit werden anerkannte Maße wie der Self-Report Habit Index über die Zeit erfasst. So wird sichtbar, wie aus einem Vorsatz eine echte Routine wird.',
  p_how_eyebrow: 'So machst du mit', p_how_title: 'In drei ruhigen Schritten dabei.',
  p_how_1_t: 'App holen', p_how_1_p: 'Lade sie aus dem App Store, Android folgt bald, oder öffne sie einfach im Browser.',
  p_how_2_t: 'Einwilligen', p_how_2_p: 'Lies die Einwilligung und den kurzen Leitfaden. Alles ist transparent und jederzeit widerrufbar.',
  p_how_3_t: 'Loslegen', p_how_3_p: 'Erfasse deine Gewohnheiten und schau deinem Fortschritt beim Wachsen zu.',
  p_trust_t: 'Deine Daten gehören dir',
  p_trust_p: 'Die Anmeldung läuft über abgesichertes Single-Sign-on, gespeichert wird nach DSGVO auf europäischer Infrastruktur. Was mit deinen Daten geschieht, steht in klarer Sprache in der Datenschutzerklärung und der Einwilligung, ohne Kleingedrucktes.',

  // research page
  r_hero_title: 'Die ganze Studie, über ein einziges Dashboard.',
  r_hero_lead: 'Health Habit Hub gibt dir die Werkzeuge, um Studien zu gestalten, Kohorten zu begleiten und Daten datenschutzkonform auszuwerten. Die technische Infrastruktur läuft im Hintergrund, damit du dich auf die Forschungsfrage konzentrieren kannst.',
  r_admin_btn: 'Zum Admin-Portal', r_docs_btn: 'Dokumentation ansehen',
  r_shot_cap: 'Ein Dashboard für alles: Studien und Fragebögen konfigurieren, die gemeinsame Wissensbasis pflegen, den Fortschritt der Teilnehmenden verfolgen und Daten exportieren.',
  r_cap_eyebrow: 'Was das Portal kann', r_cap_title: 'Alles, was eine Studie braucht.',
  r_cap_1_t: 'Studien und Kohorten', r_cap_1_p: 'Lege Studien an, teile Teilnehmende in Kohorten ein und steuere Interventionen, ohne Umwege.',
  r_cap_2_t: 'Validierte Fragebögen', r_cap_2_p: 'Anerkannte Instrumente wie der Self-Report Habit Index, automatisch über den Studienverlauf erhoben.',
  r_cap_3_t: 'Wissensbasis und Empfehlungen', r_cap_3_p: 'Eine gemeinsame Wissensbasis speist die Empfehlungen, die Teilnehmende in der App bekommen.',
  r_cap_4_t: 'Sauberer Datenexport', r_cap_4_p: 'Strukturierte Exporte für deine Auswertung in R, Python oder SPSS, ganz ohne direkten Datenbankzugriff.',
  r_cap_5_t: 'Monitoring in Echtzeit', r_cap_5_p: 'Behalte Betriebszustand und Kennzahlen über Grafana im Blick, während die Studie läuft.',
  r_cap_6_t: 'Rollen und Rechte', r_cap_6_p: 'Saubere Trennung von Admin, Forschenden und Teilnehmenden über Keycloak, abgesichert per Single-Sign-on.',

  // architecture (one line)
  r_arch_eyebrow: 'Warum das ein verlässliches Forschungswerkzeug ist',
  r_arch_title: 'Eine durchdachte Kette, vom Handy bis zur Auswertung.',
  r_arch_p: 'Jeder Baustein hat eine klare Aufgabe, und alles läuft auf einer eigenen, kontrollierten Infrastruktur an der TU Dresden. Das heißt: reproduzierbare Ergebnisse, nachvollziehbare Datenwege und keine Abhängigkeit von einem externen Anbieter, der morgen die Regeln ändert.',
  r_arch_app: 'App', r_arch_api: 'API', r_arch_auth: 'Login', r_arch_data: 'Datenbank', r_arch_rec: 'Empfehlungen', r_arch_edge: 'TU Dresden',
  r_arch_app_d: 'iOS, Android, Web', r_arch_api_d: 'Node-Service', r_arch_auth_d: 'Keycloak SSO', r_arch_data_d: 'MongoDB, Neo4j', r_arch_rec_d: 'Recommender', r_arch_edge_d: 'Traefik, TLS',

  // contact
  r_contact_eyebrow: 'Zusammenarbeit',
  r_contact_title: 'Du möchtest eine Studie durchführen?',
  r_contact_p: 'Ob eigene Studie, Kooperation oder einfach eine Frage: Schreib uns ein paar Zeilen, und wir melden uns.',
  cf_name: 'Name', cf_email: 'E-Mail', cf_org: 'Einrichtung (optional)', cf_msg: 'Deine Nachricht',
  cf_msg_ph: 'Worum geht es? Erzähl kurz von deinem Vorhaben.',
  cf_send: 'Nachricht senden', cf_hint: 'Öffnet dein E-Mail-Programm mit einer vorbereiteten Nachricht an unser Team.',

  soon: 'Bald',
};

const en: Dict = {
  nav_participants: 'Take part', nav_research: 'Research', nav_github: 'GitHub', nav_portal: 'Go to portal',
  foot_tagline: 'A research platform for healthier habits, built at TU Dresden.',
  foot_h_part: 'Participants', foot_h_res: 'Researchers', foot_h_legal: 'Legal',
  foot_download: 'Download the app', foot_guide: 'Participation guide', foot_faq: 'FAQ',
  foot_admin: 'Admin portal', foot_docs: 'Documentation', foot_contact: 'Contact',
  foot_imprint: 'Imprint', foot_privacy: 'Privacy', foot_consent: 'Consent', foot_accessibility: 'Accessibility',

  home_title: 'Small habits. Real science.',
  home_title_em: 'Real science',
  home_lead: 'Health Habit Hub helps people build healthier habits, and helps researchers understand how that actually happens. Both live in one place: an app for taking part, and a portal for running the study.',
  home_cta_part: 'I want to take part', home_cta_res: 'I do research',
  meta_devices: 'Available on iOS & Android',
  meta_gdpr: 'Data stays in Europe, under GDPR',
  meta_open: 'Open and transparent',

  chart_title: 'How a habit grows',
  chart_sub: 'When behaviour repeats, it turns into routine. The app makes that shift visible over weeks.',
  chart_note: 'Illustrative example of a typical trajectory.',
  w1: 'Week 1', w2: 'Week 6', w3: 'Week 12',
  chart_y_low: 'conscious effort', chart_y_high: 'automatic routine',

  what_eyebrow: 'The idea behind it',
  what_title: 'One platform, two points of view.',
  what_sub: 'Most health apps collect data that no one ever learns from. And most behaviour research never reaches a real app. Health Habit Hub connects the two. Participants get a simple tool to track their habits. Researchers get cleanly collected, anonymised data to understand what genuinely helps. Each side makes the other better.',
  what_side_p_t: 'For participants', what_side_p_p: 'a calm, everyday tool instead of yet another noisy app.',
  what_side_r_t: 'For researchers', what_side_r_p: 'real behaviour from daily life, not just from the lab.',

  graph_eyebrow: 'The shared body of knowledge',
  graph_title: 'Many habits become one network.',
  graph_sub: 'Participants can donate their habits anonymously. Bit by bit that builds a graph of thousands of real behaviours, where related habits move closer together. For researchers it is a map of human behaviour. For participants it is a place to see that they are not alone.',
  graph_hint: 'Hover a node to see related habits.',
  graph_c1: 'Movement', graph_c2: 'Nutrition', graph_c3: 'Sleep', graph_c4: 'Mindfulness',

  fork_eyebrow: 'Where do you start?',
  fork_title: 'Are you here to take part, or to do research?',
  fork_sub: 'Both paths start here. What waits behind each is made for you.',
  fork_p_q: 'You want to build your habits',
  fork_p_t: 'For participants',
  fork_p_p: 'Get the app, track your habits and stay in control of your data. Along the way you contribute to research, entirely by choice.',
  fork_p_go: 'Go to take part',
  fork_r_q: 'You plan or run a study',
  fork_r_t: 'For researchers',
  fork_r_p: 'Design studies, guide cohorts and analyse data in a privacy-compliant way, without ever touching a database by hand.',
  fork_r_go: 'Go to research',

  p_hero_title: 'Track your habits, and contribute to research along the way.',
  p_hero_lead: 'The Health Habit Hub app turns small daily steps into visible patterns. It is free, it treats your data with care, and every entry helps science understand healthy habits a little better.',
  p_ios: 'Download on the App Store', p_android_soon: 'Coming soon on Android',
  p_web: 'Prefer to start in the browser',
  p_s1_t: 'Explained in a single screen',
  p_s1_p: 'No long onboarding, no endless forms. A clear promise, a way in, and you are set up in about a minute.',
  p_s2_t: 'Watch habits become second nature',
  p_s2_p: 'A calendar shows at a glance how consistent you have been. Reminders quietly fade once a habit sticks, so the app never nags you forever.',
  p_s3_t: 'You are not on your own',
  p_s3_p: 'In the shared habit graph you see habits other participants have donated anonymously. Related ones cluster together, you can pan, zoom and tap through, and find where your own habits fit in.',
  p_s4_t: 'Suggestions that fit you',
  p_s4_p: 'Instead of generic advice you get ideas grounded in behavioural science, each with a plain rationale and a one-tap way to try it.',
  p_s5_t: 'Progress you can measure',
  p_s5_p: 'For each habit, established measures like the Self-Report Habit Index are tracked over time, so you can watch an intention turn into a genuine routine.',
  p_how_eyebrow: 'How to take part', p_how_title: 'In three calm steps.',
  p_how_1_t: 'Get the app', p_how_1_p: 'Download it from the App Store, Android is coming, or simply open it in your browser.',
  p_how_2_t: 'Consent', p_how_2_p: 'Read the consent and the short guide. Everything is transparent and you can withdraw at any time.',
  p_how_3_t: 'Begin', p_how_3_p: 'Record your habits and watch your progress grow.',
  p_trust_t: 'Your data belongs to you',
  p_trust_p: 'Sign-in runs over secured single sign-on, and storage follows GDPR on European infrastructure. What happens with your data is written in plain language in the privacy policy and the consent, with no fine print.',

  r_hero_title: 'The whole study, from one dashboard.',
  r_hero_lead: 'Health Habit Hub gives you the tools to design studies, guide cohorts and analyse data in a privacy-compliant way. The technical infrastructure runs in the background so you can focus on the research question.',
  r_admin_btn: 'Go to admin portal', r_docs_btn: 'Read the documentation',
  r_shot_cap: 'One dashboard for everything: configure studies and questionnaires, maintain the shared knowledge base, track participant progress and export data.',
  r_cap_eyebrow: 'What the portal does', r_cap_title: 'Everything a study needs.',
  r_cap_1_t: 'Studies and cohorts', r_cap_1_p: 'Create studies, split participants into cohorts and steer interventions, with no detours.',
  r_cap_2_t: 'Validated questionnaires', r_cap_2_p: 'Established instruments like the Self-Report Habit Index, collected automatically across the study.',
  r_cap_3_t: 'Knowledge base and recommendations', r_cap_3_p: 'A shared knowledge base feeds the recommendations participants receive in the app.',
  r_cap_4_t: 'Clean data export', r_cap_4_p: 'Structured exports for your analysis in R, Python or SPSS, with no direct database access.',
  r_cap_5_t: 'Real-time monitoring', r_cap_5_p: 'Keep operational health and metrics in view via Grafana while the study runs.',
  r_cap_6_t: 'Roles and permissions', r_cap_6_p: 'A clean split between admin, researchers and participants via Keycloak, secured with single sign-on.',

  r_arch_eyebrow: 'Why this is a dependable research tool',
  r_arch_title: 'One considered chain, from phone to analysis.',
  r_arch_p: 'Every building block has a clear job, and all of it runs on its own controlled infrastructure at TU Dresden. That means reproducible results, traceable data paths, and no dependence on an outside vendor that changes the rules tomorrow.',
  r_arch_app: 'App', r_arch_api: 'API', r_arch_auth: 'Login', r_arch_data: 'Database', r_arch_rec: 'Recommend', r_arch_edge: 'TU Dresden',
  r_arch_app_d: 'iOS, Android, Web', r_arch_api_d: 'Node service', r_arch_auth_d: 'Keycloak SSO', r_arch_data_d: 'MongoDB, Neo4j', r_arch_rec_d: 'Recommender', r_arch_edge_d: 'Traefik, TLS',

  r_contact_eyebrow: 'Working together',
  r_contact_title: 'Want to run a study?',
  r_contact_p: 'Whether it is your own study, a collaboration, or just a question, send us a few lines and we will get back to you.',
  cf_name: 'Name', cf_email: 'Email', cf_org: 'Institution (optional)', cf_msg: 'Your message',
  cf_msg_ph: 'What is it about? Tell us briefly what you have in mind.',
  cf_send: 'Send message', cf_hint: 'Opens your email app with a message prepared for our team.',

  soon: 'Soon',
};

const dicts: Record<Lang, Dict> = { de, en };
export function useT(lang: Lang) { const d = dicts[lang] ?? de; return (key: string) => d[key] ?? de[key] ?? key; }
export function otherLang(lang: Lang): Lang { return lang === 'de' ? 'en' : 'de'; }
