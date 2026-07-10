/**
 * Pure transform helpers for migrate-questionnaire-locales.js, kept
 * dependency-free (no `mongodb` import) so they're importable from tests
 * without needing a Mongo driver resolvable on the module path.
 */

/** Wraps a plain string as an English-only locale-text map. Idempotent on non-strings. */
export function wrap(str) {
  return { en: typeof str === 'string' ? str : '' };
}

/**
 * Migrates a single question's `text` and `options[].label` (returns a copy).
 * Options may themselves be bare strings — the admin questionnaire form
 * saved custom (non-library) questionnaires that way before this migration,
 * while library questionnaires (SLIQ, RAND-36, SRHI) always used
 * `{ value, label }` objects. A bare-string option is promoted to
 * `{ value: '<index>', label: wrap(option) }`, matching the value convention
 * the library questionnaires already use (sequential index strings).
 */
export function migrateQuestion(q) {
  return {
    ...q,
    text: typeof q.text === 'string' ? wrap(q.text) : q.text,
    options: Array.isArray(q.options)
      ? q.options.map((o, i) =>
          typeof o === 'string'
            ? { value: String(i), label: wrap(o) }
            : {
                ...o,
                label: typeof o.label === 'string' ? wrap(o.label) : o.label,
              }
        )
      : q.options,
  };
}

/**
 * Migrates a whole questionnaire document's title/description/questions.
 * Idempotent: already-migrated fields (objects, not strings) pass through
 * unchanged, so running this twice on the same doc is a no-op the second time.
 */
export function migrateQuestionnaireDoc(doc) {
  return {
    title: typeof doc.title === 'string' ? wrap(doc.title) : doc.title,
    description:
      typeof doc.description === 'string'
        ? wrap(doc.description)
        : doc.description,
    languages: doc.languages || ['en'],
    questions: Array.isArray(doc.questions)
      ? doc.questions.map(migrateQuestion)
      : doc.questions,
  };
}
