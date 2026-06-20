function safeDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Calculate the current consecutive-day study streak.
 *
 * Rules:
 *  - Multiple activities on the same calendar day count as 1 streak day.
 *  - Walking backwards from today: count each day that has at least one activity.
 *  - Grace period: if today has no activity yet but yesterday does, the streak
 *    is still alive (user hasn't had a chance to study today yet).
 *
 * @param {string[]} dateValues — array of ISO date strings (exam + feedback dates)
 * @returns {number} streak length in days
 */
export function calcStreak(dateValues) {
  const days = Array.from(
    new Set(
      dateValues
        .map(v => { const d = safeDate(v); return d ? d.toISOString().slice(0, 10) : null; })
        .filter(Boolean)
    )
  ).sort((a, b) => new Date(b) - new Date(a));

  if (!days.length) return 0;

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < days.length; i++) {
    const expected = cursor.toISOString().slice(0, 10);

    if (days[i] === expected) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    // Grace: if we haven't matched today yet (streak===0) check yesterday
    if (i === 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      if (days[i] === yesterday.toISOString().slice(0, 10)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
    }

    break;
  }

  return streak;
}
