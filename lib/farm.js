import crypto from 'node:crypto';
import { db, hasDb } from './db';
import { dayKey } from './time';

const K = {
  ver: 'farm:ver',
  workers: 'farm:workers',
  settings: 'farm:settings',
  st: 'farm:st',
  sum: (id) => `farm:sum:${id}`,
  ev: (id) => `farm:ev:${id}`,
};

// maxBreaks: null = unlimited, cooldownMin: minutes between breaks, breakMaxMin: allowed break length (0 = no limit)
export const DEFAULT_SETTINGS = { maxBreaks: 2, cooldownMin: 60, breakMaxMin: 30 };

export class FarmError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const parse = (s, d) => {
  if (s == null) return d;
  if (typeof s !== 'string') return s;
  try {
    return JSON.parse(s);
  } catch {
    return d;
  }
};

/* ---------------- reading (with a tiny per-instance cache) ---------------- */

let cache = { v: null, data: null, checked: 0 };

async function loadAll(v) {
  const [workersS, settingsS, stS] = await Promise.all([
    db.get(K.workers),
    db.get(K.settings),
    db.hgetall(K.st),
  ]);
  const workers = parse(workersS, []);
  const settings = { ...DEFAULT_SETTINGS, ...parse(settingsS, {}) };
  const status = {};
  for (const [id, s] of Object.entries(stS || {})) status[id] = parse(s, null);
  const sums = await Promise.all(workers.map((w) => db.hgetall(K.sum(w.id))));
  const logs = {};
  workers.forEach((w, i) => {
    const o = {};
    for (const [d, s] of Object.entries(sums[i] || {})) o[d] = parse(s, null);
    logs[w.id] = o;
  });
  return { v, workers, settings, status, logs, hasDb };
}

export async function getState({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache.data && now - cache.checked < 1000) return cache.data;
  const v = Number((await db.get(K.ver)) || 0);
  cache.checked = now;
  if (!fresh && cache.data && cache.v === v) return cache.data;
  const data = await loadAll(v);
  cache = { v, data, checked: Date.now() };
  return data;
}

async function bump() {
  await db.incr(K.ver);
  return getState({ fresh: true });
}

export async function getDayEvents(workerId, day) {
  return parse(await db.hget(K.ev(workerId), day), []);
}

/* ---------------- worker actions ---------------- */

export async function workerAction(workerId, action, { byAdmin = false } = {}) {
  const now = Date.now();
  const today = dayKey(now);
  const [workersS, settingsS, stS] = await Promise.all([
    db.get(K.workers),
    db.get(K.settings),
    db.hget(K.st, workerId),
  ]);
  const workers = parse(workersS, []);
  if (!workers.find((w) => w.id === workerId)) throw new FarmError('Няма такъв работник', 404);
  const settings = { ...DEFAULT_SETTINGS, ...parse(settingsS, {}) };
  const st = parse(stS, null) || { state: 'off' };

  const sums = {};
  const getSum = async (d) => {
    if (!sums[d]) sums[d] = parse(await db.hget(K.sum(workerId), d), null) || { w: 0, b: 0, n: 0 };
    return sums[d];
  };
  const closeSegment = async () => {
    const sec = Math.max(0, Math.round((now - st.since) / 1000));
    const s = await getSum(st.segDay || dayKey(st.since));
    if (st.state === 'working') s.w += sec;
    else if (st.state === 'break') s.b += sec;
  };

  let next;
  let ev;
  if (action === 'in') {
    if (st.state !== 'off') throw new FarmError('Вече си на работа');
    next = { state: 'working', since: now, segDay: today, startedAt: now, lastBreakEnd: st.lastBreakEnd || 0 };
    await getSum(today);
    ev = 'in';
  } else if (action === 'break') {
    if (st.state !== 'working') throw new FarmError('Не си на работа');
    const ts = await getSum(today);
    if (settings.maxBreaks !== null && ts.n >= settings.maxBreaks) {
      throw new FarmError(
        settings.maxBreaks === 0 ? 'Почивките са изключени' : `Изчерпа почивките за днес (${settings.maxBreaks})`
      );
    }
    const left = (st.lastBreakEnd || 0) + settings.cooldownMin * 60000 - now;
    if (left > 0) throw new FarmError(`Следваща почивка след ${Math.ceil(left / 60000)} мин`);
    await closeSegment();
    ts.n += 1;
    next = { ...st, state: 'break', since: now, segDay: today };
    ev = 'bs';
  } else if (action === 'resume') {
    if (st.state !== 'break') throw new FarmError('Не си в почивка');
    await closeSegment();
    next = { ...st, state: 'working', since: now, segDay: today, lastBreakEnd: now };
    ev = 'be';
  } else if (action === 'out') {
    if (st.state === 'off') throw new FarmError('Не си на работа');
    await closeSegment();
    next = {
      state: 'off',
      lastOut: now,
      lastBreakEnd: st.state === 'break' ? now : st.lastBreakEnd || 0,
    };
    ev = byAdmin ? 'aout' : 'out';
  } else {
    throw new FarmError('Невалидно действие');
  }

  const sumWrite = {};
  for (const [d, s] of Object.entries(sums)) sumWrite[d] = JSON.stringify(s);
  const events = parse(await db.hget(K.ev(workerId), today), []);
  events.push({ t: ev, at: now });

  await Promise.all([
    db.hset(K.st, { [workerId]: JSON.stringify(next) }),
    db.hset(K.sum(workerId), sumWrite),
    db.hset(K.ev(workerId), { [today]: JSON.stringify(events.slice(-200)) }),
  ]);
  return bump();
}

/* ---------------- admin ---------------- */

export function checkAdmin(key) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) throw new FarmError('ADMIN_PASSWORD не е зададена', 500);
  const a = crypto.createHash('sha256').update(String(key || '')).digest();
  const b = crypto.createHash('sha256').update(pass).digest();
  if (!crypto.timingSafeEqual(a, b)) throw new FarmError('Грешна парола', 401);
}

const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);
const num = (v, min, max, def) => {
  if (v === '' || v === null || v === undefined) return def;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

export async function adminAction(body) {
  const { action } = body || {};
  if (action === 'ping') return getState({ fresh: true });
  if (action === 'forceOut') return workerAction(body.id, 'out', { byAdmin: true });

  const workers = parse(await db.get(K.workers), []);

  if (action === 'addWorker') {
    const name = cleanName(body.name);
    if (!name) throw new FarmError('Въведи име');
    if (workers.some((w) => w.name.toLowerCase() === name.toLowerCase())) throw new FarmError('Това име вече съществува');
    workers.push({ id: crypto.randomBytes(5).toString('hex'), name });
    await db.set(K.workers, JSON.stringify(workers));
  } else if (action === 'renameWorker') {
    const name = cleanName(body.name);
    const w = workers.find((x) => x.id === body.id);
    if (!w) throw new FarmError('Няма такъв работник', 404);
    if (!name) throw new FarmError('Въведи име');
    w.name = name;
    await db.set(K.workers, JSON.stringify(workers));
  } else if (action === 'removeWorker') {
    const st = parse(await db.hget(K.st, body.id), null);
    if (st && st.state !== 'off') await workerAction(body.id, 'out', { byAdmin: true });
    await db.set(K.workers, JSON.stringify(workers.filter((w) => w.id !== body.id)));
    await db.hdel(K.st, body.id);
  } else if (action === 'moveWorker') {
    const i = workers.findIndex((w) => w.id === body.id);
    const j = i + (body.dir === 'up' ? -1 : 1);
    if (i < 0 || j < 0 || j >= workers.length) return getState({ fresh: true });
    [workers[i], workers[j]] = [workers[j], workers[i]];
    await db.set(K.workers, JSON.stringify(workers));
  } else if (action === 'settings') {
    const s = body.settings || {};
    const settings = {
      maxBreaks: s.maxBreaks === '' || s.maxBreaks === null ? null : num(s.maxBreaks, 0, 50, DEFAULT_SETTINGS.maxBreaks),
      cooldownMin: num(s.cooldownMin, 0, 24 * 60, 0),
      breakMaxMin: num(s.breakMaxMin, 0, 24 * 60, 0),
    };
    await db.set(K.settings, JSON.stringify(settings));
  } else if (action === 'setDay') {
    if (!workers.find((w) => w.id === body.id)) throw new FarmError('Няма такъв работник', 404);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.day))) throw new FarmError('Невалидна дата');
    const cur = parse(await db.hget(K.sum(body.id), body.day), null) || { w: 0, b: 0, n: 0 };
    cur.w = num(body.minutes, 0, 24 * 60, 0) * 60;
    cur.edited = true;
    await db.hset(K.sum(body.id), { [body.day]: JSON.stringify(cur) });
  } else {
    throw new FarmError('Невалидно действие');
  }
  return bump();
}
