/**
 * Build a MongoDB filter object from query parameters.
 * @param {{ group?: string, category?: string, from?: string, to?: string }} params
 * @returns {object}
 */
function buildHabitFilter({ group, category, from, to } = {}) {
  const filter = {};
  if (group) filter.group = group;
  if (category) filter.category = category;
  if (from || to) {
    filter.donatedAt = {};
    if (from) filter.donatedAt.$gte = new Date(from);
    if (to) filter.donatedAt.$lte = new Date(to);
  }
  return filter;
}

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

/**
 * Return a paginated habits feed.
 * @param {{ db: object, group?: string, category?: string, from?: string, to?: string, page?: number, limit?: number }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, results: Array }>}
 */
export async function getHabitsFeed({
  db,
  group,
  category,
  from,
  to,
  page = 1,
  limit = 20,
}) {
  const pageNum = Math.max(1, page);
  const limitNum = Math.min(100, Math.max(1, limit));
  const skip = (pageNum - 1) * limitNum;

  const filter = buildHabitFilter({ group, category, from, to });
  const collection = db.collection('habit_donations');

  const [total, paginated] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).skip(skip).limit(limitNum).toArray(),
  ]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    results: paginated.map((d) => ({
      participantId: d.participantId,
      habitName: d.habitName,
      category: d.category,
      donatedAt: d.donatedAt,
    })),
  };
}

/**
 * Build and return a CSV string of all donated habits matching the given filters.
 * @param {{ db: object, group?: string, category?: string, from?: string, to?: string }} deps
 * @returns {Promise<string>}
 */
export async function buildHabitsCSV({ db, group, category, from, to }) {
  const filter = buildHabitFilter({ group, category, from, to });
  const docs = await db.collection('habit_donations').find(filter).toArray();

  const header = 'participantId,habitName,category,donatedAt';
  const rows = docs.map((d) =>
    [
      d.participantId,
      d.habitName,
      d.category,
      d.donatedAt instanceof Date ? d.donatedAt.toISOString() : d.donatedAt,
    ]
      .map(escapeCSV)
      .join(',')
  );

  return [header, ...rows].join('\n');
}
