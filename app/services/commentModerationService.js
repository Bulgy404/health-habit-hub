/**
 * commentModerationService — decides whether a community comment should be
 * held for researcher/admin review before it is published.
 *
 * Uses a local wordlist (via `obscenity`, which also catches common
 * leetspeak/obfuscated profanity) plus regex spam/PII signals (links,
 * emails, phone numbers) rather than an LLM call: for short, anonymous
 * community reactions this is instant, free, and has no external service to
 * fail — an earlier LLM-based version added a network round-trip and an
 * ongoing token cost for a check that a fast local one covers just as well
 * in practice. The tradeoff is it can't catch context-dependent harassment
 * that uses no flagged words, or nuanced misinformation — out of scope for
 * a local wordlist by nature.
 */

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.[a-z0-9-]+\.[a-z]{2,}\S*/i;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Common phone groupings (555-123-4567, (555) 123-4567, +1 555 123 4567) or
// a bare run of 9+ digits — deliberately narrower than "any digit-ish run",
// so dates (2026-01-05) and small counts don't false-positive.
const PHONE_PATTERN = /\+?\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{9,}\b/;

/**
 * Moderate a comment's text.
 * @param {{ text: string }} deps
 * @returns {{ flagged: boolean, reason: string|null }}
 */
export function moderateComment({ text }) {
  if (matcher.hasMatch(text)) {
    return { flagged: true, reason: 'Contains profanity or a slur' };
  }
  if (URL_PATTERN.test(text)) {
    return { flagged: true, reason: 'Contains a link' };
  }
  if (EMAIL_PATTERN.test(text)) {
    return { flagged: true, reason: 'Contains an email address' };
  }
  if (PHONE_PATTERN.test(text)) {
    return { flagged: true, reason: 'Contains a phone number' };
  }
  return { flagged: false, reason: null };
}
