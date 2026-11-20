export const TZ = 'Europe/Sofia';

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const clockFmt = new Intl.DateTimeFormat('bg-BG', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const dayKey = (ts) => dayFmt.format(new Date(ts));
export const clock = (ts) => clockFmt.format(new Date(ts));

const pad = (n) => String(n).padStart(2, '0');

// 3725 -> "01:02:05"
export function timer(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// 27000 -> "7ч 30м"
export function hm(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (!h) return `${m}м`;
  return m ? `${h}ч ${m}м` : `${h}ч`;
}

// 27000 -> "7.5"
export function hDec(sec) {
  const h = sec / 3600;
  if (h <= 0) return '';
  return h >= 10 ? String(Math.round(h)) : String(Math.round(h * 10) / 10);
}

export const MONTHS = [
  'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
  'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

export function liveTotals(status, log, now) {
  const today = dayKey(now);
  const s = (log && log[today]) || { w: 0, b: 0, n: 0 };
  let w = s.w || 0;
  let b = s.b || 0;
  const elapsed = status && status.since ? Math.max(0, (now - status.since) / 1000) : 0;
  if (status?.state === 'working') w += elapsed;
  if (status?.state === 'break') b += elapsed;
  return { w, b, n: s.n || 0, elapsed, today };
}

export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

const HUES = [145, 28, 205, 340, 265, 48, 180, 10, 230, 95];
export function hueFor(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}
