// Missing policy preserves legacy unlimited late completion. Deadlines are
// exclusive midnight boundaries in the assignment's explicit IANA timezone.
export function scheduledDate(date, timeZone = 'Europe/Berlin') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

export function windowAvailability(window, policy, now = new Date()) {
  const timeZone = policy?.timeZone ?? 'Europe/Berlin';
  const date = scheduledDate(window.scheduledFor, timeZone);
  let closesAt = null;
  if (policy && policy.lateDays !== null) {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + policy.lateDays + 1);
    const target = day.getTime();
    let instant = target;
    // Resolve local midnight, including DST changes, without the host timezone.
    for (let i = 0; i < 4; i++) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(instant));
      const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      const local = Date.UTC(
        +v.year,
        +v.month - 1,
        +v.day,
        +v.hour,
        +v.minute,
        +v.second
      );
      instant += target - local;
    }
    closesAt = new Date(instant);
  }
  const missed = !window.submittedAt && closesAt !== null && now >= closesAt;
  return {
    scheduledDate: date,
    closesAt,
    timeZone,
    isLate: date < scheduledDate(now, timeZone),
    status: window.submittedAt
      ? 'completed'
      : missed
        ? 'missed'
        : new Date(window.scheduledFor) > now
          ? 'upcoming'
          : 'open',
  };
}

export async function annotateWindows(db, windows, now = new Date()) {
  if (!windows.length) return [];
  const ids = [
    ...new Map(
      windows
        .filter((w) => w.assignmentId)
        .map((w) => [String(w.assignmentId), w.assignmentId])
    ).values(),
  ];
  const assignments = await db
    .collection('questionnaire_assignments')
    .find({ _id: { $in: ids } })
    .toArray();
  const byId = new Map(assignments.map((a) => [String(a._id), a]));
  return windows.map((w) => {
    const assignment = byId.get(String(w.assignmentId));
    return {
      ...w,
      ...windowAvailability(w, assignment?.responsePolicy, now),
      assignmentActive: assignment?.active !== false,
    };
  });
}
