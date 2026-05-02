const DAY_MS = 86_400_000;

export function isoWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

export function dateDaysAgo(days: number) {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}
