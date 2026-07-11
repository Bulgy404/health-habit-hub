// app/services/adminHabitService.js
//
// Admin "habit donations" feed. Donated habits are the source-of-truth in
// Neo4j (created by the habit-donation pipeline as `(:Habit {is_habit:true})`
// linked via `(:User)-[:DONATED]->(:Habit)`), so this reads from the graph —
// not from a MongoDB collection.

import { ObjectId } from 'mongodb';

/**
 * Escape a value for inclusion in a CSV cell.
 * @param {*} v
 * @returns {string}
 */
function escapeCSV(v) {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Normalise a `created_at`/`donatedAt` value (Neo4j may hand back a string). */
function toIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// Languages the admin portal supports, for localised BCIO concept labels
// (see habitDonationService.js's ADMIN_BCIO_LANGS, where these are produced).
const ADMIN_BCIO_LANGS = ['de', 'fr', 'nl'];

/** Normalises a requested display language to one with a translated BCIO label, defaulting to 'en'. */
function normalizeAdminLang(lang) {
  const code = String(lang || '')
    .slice(0, 2)
    .toLowerCase();
  return ADMIN_BCIO_LANGS.includes(code) ? code : 'en';
}

/**
 * Fetch all donated habits from Neo4j with donor, category (BCIO label), study
 * and enrolment group, then apply filters/pagination in JS. Group labels are
 * resolved from the Mongo `studies` collection so the admin sees human labels
 * (e.g. "G1") rather than raw group ObjectIds.
 *
 * @param {{ db, neo4jRun, group?, category?, from?, to?, lang?: string }} deps
 * @returns {Promise<Array<{id,participantId,habitName,category,group,studyId,donatedAt}>>}
 */
async function fetchDonatedHabits({
  db,
  neo4jRun,
  group,
  category,
  from,
  to,
  lang,
}) {
  if (!neo4jRun) return [];

  const normalizedLang = normalizeAdminLang(lang);
  // For 'en', $transKey resolves to a property that's never actually stored
  // (the canonical English label lives on bcio_concept_label, unsuffixed),
  // so the coalesce below falls straight through to it — no special-casing.
  const transKey = `bcio_concept_label_${normalizedLang}`;

  const rows = await neo4jRun(
    `MATCH (u:User)-[d:DONATED]->(h:Habit)
     WHERE coalesce(h.is_habit, true) = true
     OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(b:BCIOConcept)
     OPTIONAL MATCH (u)-[e:ENROLLED_IN]->(st:Study)
       WHERE h.studyId IS NOT NULL AND st.uuid = h.studyId
     WITH h, u, d,
          head(collect(DISTINCT coalesce(properties(b)[$transKey], b.bcio_concept_label))) AS bcioLabel,
          head(collect(DISTINCT e.groupId))            AS groupId
     RETURN h.uuid AS id, u.userID AS participantId, h.sentence AS habitName,
            coalesce(bcioLabel, 'Other') AS category, h.studyId AS studyId,
            groupId AS groupId, coalesce(d.at, h.created_at) AS donatedAt
     ORDER BY donatedAt DESC`,
    { transKey }
  );

  // Resolve group ObjectId → label per study.
  const studyIds = [...new Set(rows.map((r) => r.studyId).filter(Boolean))];
  const groupLabelByStudy = {};
  if (studyIds.length > 0) {
    const oids = studyIds
      .map((s) => {
        try {
          return new ObjectId(s);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (oids.length > 0) {
      const studies = await db
        .collection('studies')
        .find({ _id: { $in: oids } })
        .project({ groups: 1 })
        .toArray();
      for (const s of studies) {
        const map = {};
        for (const g of s.groups || []) {
          map[g.id?.toString()] = g.label;
        }
        groupLabelByStudy[s._id.toString()] = map;
      }
    }
  }

  let mapped = rows.map((r) => {
    const gid = r.groupId ? String(r.groupId) : null;
    const label =
      gid && r.studyId
        ? (groupLabelByStudy[String(r.studyId)]?.[gid] ?? gid)
        : null;
    return {
      id: r.id,
      participantId: r.participantId ?? '',
      habitName: r.habitName ?? '',
      category: r.category ?? 'Other',
      group: label,
      studyId: r.studyId ? String(r.studyId) : null,
      donatedAt: toIso(r.donatedAt),
    };
  });

  // Filters (applied in JS; created_at is stored as an ISO string).
  if (from) mapped = mapped.filter((r) => r.donatedAt && r.donatedAt >= from);
  if (to) {
    const toEnd = `${to}T23:59:59.999Z`;
    mapped = mapped.filter((r) => r.donatedAt && r.donatedAt <= toEnd);
  }
  if (category) {
    mapped = mapped.filter((r) => r.category === category);
  }
  if (group) {
    mapped = mapped.filter((r) => (r.group ?? '') === group);
  }
  return mapped;
}

/**
 * Return the distinct set of BCIO category labels currently used by donated
 * habits, localised to `lang`, sorted alphabetically. Backs the admin
 * donations page's category filter dropdown — every value this returns is
 * guaranteed to match what `fetchDonatedHabits`'s `category` filter expects,
 * since both use the same coalesce-to-localised-label logic.
 * @param {{ neo4jRun, lang?: string }} deps
 * @returns {Promise<string[]>}
 */
export async function listHabitCategories({ neo4jRun, lang }) {
  if (!neo4jRun) return [];
  const normalizedLang = normalizeAdminLang(lang);
  const transKey = `bcio_concept_label_${normalizedLang}`;

  const rows = await neo4jRun(
    `MATCH (u:User)-[:DONATED]->(h:Habit)
     WHERE coalesce(h.is_habit, true) = true
     OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(b:BCIOConcept)
     WITH h, head(collect(DISTINCT coalesce(properties(b)[$transKey], b.bcio_concept_label))) AS bcioLabel
     WITH DISTINCT coalesce(bcioLabel, 'Other') AS category
     RETURN category
     ORDER BY category`,
    { transKey }
  );
  return rows.map((r) => r.category);
}

/**
 * List the habits a single participant created/donated (from Neo4j), newest
 * first, with BCIO category and study.
 * @param {{ neo4jRun, userId: string }} deps
 * @returns {Promise<Array<{id,habitName,category,isHabit,studyId,donatedAt}>>}
 */
export async function getParticipantHabits({ neo4jRun, userId }) {
  if (!neo4jRun) return [];
  const rows = await neo4jRun(
    `MATCH (u:User {userID: $userId})-[d:DONATED]->(h:Habit)
     OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(b:BCIOConcept)
     WITH h, d, head(collect(DISTINCT b.bcio_concept_label)) AS bcioLabel
     RETURN h.uuid AS id, h.sentence AS habitName,
            coalesce(bcioLabel, 'Other') AS category,
            coalesce(h.is_habit, true) AS isHabit, h.studyId AS studyId,
            coalesce(d.at, h.created_at) AS donatedAt
     ORDER BY donatedAt DESC`,
    { userId: String(userId) }
  );
  return rows.map((r) => ({
    id: r.id,
    habitName: r.habitName ?? '',
    category: r.category ?? 'Other',
    isHabit: r.isHabit !== false,
    studyId: r.studyId ? String(r.studyId) : null,
    donatedAt: toIso(r.donatedAt),
  }));
}

/**
 * Return a paginated habits-donation feed.
 * @param {{ db, neo4jRun, group?, category?, from?, to?, page?, limit?, lang?: string }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, results: Array }>}
 */
export async function getHabitsFeed({
  db,
  neo4jRun,
  group,
  category,
  from,
  to,
  page = 1,
  limit = 20,
  lang,
}) {
  const pageNum = Math.max(1, page);
  const limitNum = Math.min(100, Math.max(1, limit));
  const skip = (pageNum - 1) * limitNum;

  const all = await fetchDonatedHabits({
    db,
    neo4jRun,
    group,
    category,
    from,
    to,
    lang,
  });

  return {
    total: all.length,
    page: pageNum,
    limit: limitNum,
    results: all.slice(skip, skip + limitNum),
  };
}

/**
 * Build a CSV string of all donated habits matching the given filters.
 * @param {{ db, neo4jRun, group?, category?, from?, to?, lang?: string }} deps
 * @returns {Promise<string>}
 */
export async function buildHabitsCSV({
  db,
  neo4jRun,
  group,
  category,
  from,
  to,
  lang,
}) {
  const docs = await fetchDonatedHabits({
    db,
    neo4jRun,
    group,
    category,
    from,
    to,
    lang,
  });

  const header = 'participantId,habitName,category,group,donatedAt';
  const rows = docs.map((d) =>
    [d.participantId, d.habitName, d.category, d.group ?? '', d.donatedAt]
      .map(escapeCSV)
      .join(',')
  );

  return [header, ...rows].join('\n');
}
