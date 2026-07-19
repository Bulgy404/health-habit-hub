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
 *
 * NOTE: the global CSP (middleware/securityHeaders.js) blocks un-nonced inline
 * <style>, so the caller MUST pass `nonce` (from res.locals.cspNonce) — without
 * it the browser drops the CSS and the page falls back to unstyled serif text.
 */

const PAGES = ['privacy', 'imprint', 'accessibility'];

const NAV_LABELS = {
  en: {
    privacy: 'Privacy Policy',
    imprint: 'Imprint',
    accessibility: 'Accessibility',
  },
  de: {
    privacy: 'Datenschutz',
    imprint: 'Impressum',
    accessibility: 'Barrierefreiheit',
  },
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
 * @param {string} [opts.nonce]  CSP nonce for the inline <style> (required in prod).
 * @returns {string} Full HTML document.
 */
export function renderLegalPage({
  title,
  lang,
  pageName,
  contentHtml,
  meta = {},
  nonce = '',
}) {
  const otherLang = lang === 'de' ? 'en' : 'de';
  const labels = NAV_LABELS[lang] ?? NAV_LABELS.en;
  const nonceAttr = nonce ? ` nonce="${escapeHtml(nonce)}"` : '';

  const tabs = PAGES.map((p) => {
    const href = `/${lang}/${p}`;
    const label = escapeHtml(labels[p]);
    return p === pageName
      ? `<span class="tab active" aria-current="page">${label}</span>`
      : `<a class="tab" href="${href}">${label}</a>`;
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
  <style${nonceAttr}>
    :root {
      --primary: #2e8c00; --primary-hover: #256f00;
      --bg: #f4f6f3; --surface: #ffffff; --text: #1a1c19;
      --muted: #5c6159; --border: #e2e5e0; --link: #256f00;
      --chip: #eef2ea;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --primary: #7bd44e; --primary-hover: #93e06a;
        --bg: #10120d; --surface: #1b1e18; --text: #e3e4de;
        --muted: #a3a89d; --border: #2c312a; --link: #9fe07a;
        --chip: #232821;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--text);
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.65; -webkit-font-smoothing: antialiased;
    }
    .wrap { max-width: 820px; margin: 0 auto; padding: 0 1rem; }
    header.top { background: var(--primary); color: #fff; padding: 1.4rem 0 1.5rem; }
    header.top .brand {
      font-weight: 700; letter-spacing: .2px; opacity: .95; font-size: .9rem;
      text-transform: uppercase;
    }
    header.top h1 { margin: .35rem 0 0; font-size: 1.7rem; line-height: 1.25; }
    .meta { color: rgba(255,255,255,.88); font-size: .85rem; margin: .45rem 0 0; }
    /* Tab bar */
    .toolbar {
      position: sticky; top: 0; z-index: 5;
      background: var(--surface); border-bottom: 1px solid var(--border);
      box-shadow: 0 1px 3px rgba(0,0,0,.04);
    }
    .toolbar .wrap {
      display: flex; align-items: center; justify-content: space-between;
      gap: .75rem; flex-wrap: wrap; padding-top: .7rem; padding-bottom: .7rem;
    }
    .tabs { display: flex; gap: .4rem; flex-wrap: wrap; }
    .tab {
      display: inline-block; padding: .48rem .95rem; border-radius: 999px;
      border: 1px solid var(--border); background: var(--chip);
      color: var(--link); text-decoration: none; font-size: .9rem; font-weight: 600;
      transition: background .12s, border-color .12s, color .12s;
    }
    .tab:hover { border-color: var(--primary); }
    .tab.active {
      background: var(--primary); color: #fff; border-color: var(--primary);
      box-shadow: 0 1px 4px rgba(46,140,0,.35);
    }
    .lang {
      display: inline-flex; align-items: center; gap: .3rem;
      padding: .42rem .8rem; border-radius: 999px;
      border: 1px solid var(--border); background: var(--surface);
      color: var(--link); text-decoration: none; font-size: .85rem; font-weight: 600;
    }
    .lang:hover { border-color: var(--primary); }
    /* Document card */
    main.card {
      margin: 1.5rem auto 1rem; padding: 1.75rem 1.5rem 2rem;
      background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    }
    main.card h1, main.card h2 { font-size: 1.32rem; margin: 1.9rem 0 .6rem; line-height: 1.3; }
    main.card h1:first-child, main.card h2:first-child { margin-top: 0; }
    main.card h3 { font-size: 1.1rem; margin: 1.5rem 0 .4rem; }
    main.card h4, main.card h5 { font-size: 1rem; margin: 1.15rem 0 .3rem; }
    main.card p, main.card li { color: var(--text); }
    main.card a { color: var(--link); }
    main.card ul { padding-left: 1.25rem; }
    main.card hr { border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }
    footer.foot {
      margin: 0 auto 3rem; color: var(--muted); font-size: .85rem;
      display: flex; flex-wrap: wrap; gap: .5rem 1rem;
      align-items: center; justify-content: space-between;
    }
    footer.foot a { color: var(--link); text-decoration: none; }
    footer.foot a:hover { text-decoration: underline; }
    @media (max-width: 560px) {
      main.card { border-radius: 0; border-left: 0; border-right: 0; margin-left: -1rem; margin-right: -1rem; }
    }
  </style>
</head>
<body>
  <header class="top">
    <div class="wrap">
      <div class="brand">Health Habit Hub</div>
      <h1>${escapeHtml(title)}</h1>
      ${effective}
    </div>
  </header>
  <div class="toolbar">
    <div class="wrap">
      <nav class="tabs" aria-label="Legal documents">${tabs}</nav>
      <a class="lang" href="/${otherLang}/${pageName}" hreflang="${otherLang}">
        ${otherLang === 'de' ? '🇩🇪 Deutsch' : '🇬🇧 English'}
      </a>
    </div>
  </div>
  <div class="wrap">
    <main class="card">${contentHtml}</main>
    <footer class="foot">
      <span>© ${new Date().getFullYear()} TU Dresden · Research Group Digital Health</span>
    </footer>
  </div>
</body>
</html>`;
}

export const LEGAL_PAGES = PAGES;
