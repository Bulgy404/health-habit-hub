/**
 * Server-side renderer for the public legal pages (privacy, imprint,
 * accessibility). The controllers return JSON to the mobile app but a styled,
 * standalone HTML page to browsers (content negotiation) — the latter is what
 * App Store / Play Store reviewers and end users see when they open the URL.
 *
 * The design language mirrors the Next.js admin portal: the same primary green
 * (#2e8c00), a clean system sans-serif stack, a centred readable column, and
 * light/dark awareness via `prefers-color-scheme`. The rendered document body
 * (`contentHtml`) is trusted first-party markdown from `app/language/**`.
 */

const PAGES = ['privacy', 'imprint', 'accessibility'];

const NAV_LABELS = {
  en: { privacy: 'Privacy Policy', imprint: 'Imprint', accessibility: 'Accessibility' },
  de: { privacy: 'Datenschutz', imprint: 'Impressum', accessibility: 'Barrierefreiheit' },
};

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} opts
 * @param {string} opts.title    Page title (localised, e.g. "Privacy Policy").
 * @param {string} opts.lang     Active locale (`en` | `de`).
 * @param {string} opts.pageName One of `privacy` | `imprint` | `accessibility`.
 * @param {string} opts.contentHtml Rendered document body (trusted HTML).
 * @param {Record<string,string>} [opts.meta] Front-matter (version, effectiveDate).
 * @returns {string} Full HTML document.
 */
export function renderLegalPage({ title, lang, pageName, contentHtml, meta = {} }) {
  const otherLang = lang === 'de' ? 'en' : 'de';
  const labels = NAV_LABELS[lang] ?? NAV_LABELS.en;

  const crossLinks = PAGES.map((p) => {
    const href = `/${lang}/${p}`;
    const label = escapeHtml(labels[p]);
    return p === pageName
      ? `<span class="crumb active" aria-current="page">${label}</span>`
      : `<a class="crumb" href="${href}">${label}</a>`;
  }).join('');

  const effective = meta.effectiveDate
    ? `<p class="meta">${lang === 'de' ? 'Stand' : 'Effective'}: ${escapeHtml(meta.effectiveDate)}${
        meta.version ? ` · v${escapeHtml(meta.version)}` : ''
      }</p>`
    : '';

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="index,follow" />
  <title>${escapeHtml(title)} · Health Habit Hub</title>
  <style>
    :root {
      --primary: #2e8c00; --primary-hover: #256f00;
      --bg: #f7f8f7; --surface: #ffffff; --text: #1a1c19;
      --muted: #5c6159; --border: #e2e5e0; --link: #256f00;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --primary: #7bd44e; --primary-hover: #93e06a;
        --bg: #12140f; --surface: #1b1e18; --text: #e3e4de;
        --muted: #a3a89d; --border: #2c312a; --link: #9fe07a;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--text);
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.65; -webkit-font-smoothing: antialiased;
    }
    header.top {
      background: var(--primary); color: #fff; padding: 1.25rem 1rem;
    }
    header.top .inner { max-width: 780px; margin: 0 auto; }
    header.top .brand { font-weight: 700; letter-spacing: .2px; opacity: .95; font-size: .95rem; }
    header.top h1 { margin: .35rem 0 0; font-size: 1.6rem; line-height: 1.25; }
    .meta { color: rgba(255,255,255,.85); font-size: .85rem; margin: .4rem 0 0; }
    nav.crumbs {
      max-width: 780px; margin: 0 auto; padding: .75rem 1rem 0;
      display: flex; flex-wrap: wrap; gap: .35rem .75rem; font-size: .9rem;
    }
    .crumb { color: var(--link); text-decoration: none; }
    .crumb:hover { text-decoration: underline; }
    .crumb.active { color: var(--muted); font-weight: 600; }
    main {
      max-width: 780px; margin: 1rem auto 3rem; padding: 1.5rem 1.25rem 2rem;
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    }
    main h1, main h2 { font-size: 1.3rem; margin: 1.8rem 0 .6rem; line-height: 1.3; }
    main h1:first-child, main h2:first-child { margin-top: 0; }
    main h3 { font-size: 1.08rem; margin: 1.4rem 0 .4rem; }
    main h4, main h5 { font-size: 1rem; margin: 1.1rem 0 .3rem; }
    main p, main li { color: var(--text); }
    main a { color: var(--link); }
    main ul { padding-left: 1.25rem; }
    main hr { border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }
    footer.foot {
      max-width: 780px; margin: 0 auto 3rem; padding: 0 1.25rem;
      color: var(--muted); font-size: .85rem; display: flex; flex-wrap: wrap;
      gap: .5rem 1rem; align-items: center; justify-content: space-between;
    }
    footer.foot a { color: var(--link); text-decoration: none; }
    footer.foot a:hover { text-decoration: underline; }
    .lang-switch { display: inline-flex; gap: .5rem; }
  </style>
</head>
<body>
  <header class="top">
    <div class="inner">
      <div class="brand">Health Habit Hub</div>
      <h1>${escapeHtml(title)}</h1>
      ${effective}
    </div>
  </header>
  <nav class="crumbs" aria-label="Legal pages">${crossLinks}</nav>
  <main>${contentHtml}</main>
  <footer class="foot">
    <span>© ${new Date().getFullYear()} TU Dresden · Research Group Digital Health</span>
    <span class="lang-switch">
      <a href="/${otherLang}/${pageName}">${otherLang === 'de' ? 'Deutsch' : 'English'}</a>
    </span>
  </footer>
</body>
</html>`;
}

export const LEGAL_PAGES = PAGES;
