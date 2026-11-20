import { Redis } from '@upstash/redis';

// Works with the default Upstash/Vercel names and with any custom prefix (e.g. STORAGE_KV_REST_API_URL)
function pick(...suffixes) {
  for (const s of suffixes) if (process.env[s]) return process.env[s];
  for (const s of suffixes) {
    const k = Object.keys(process.env).find((key) => key.endsWith(s) && !key.includes('READ_ONLY'));
    if (k) return process.env[k];
  }
  return undefined;
}
const url = pick('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const token = pick('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');

export const hasDb = Boolean(url && token);

// In-memory fallback (local dev / before a database is connected)
function memory() {
  const g = globalThis;
  if (!g.__farmMem) g.__farmMem = new Map();
  const m = g.__farmMem;
  const hash = (k) => {
    if (!(m.get(k) instanceof Map)) m.set(k, new Map());
    return m.get(k);
  };
  return {
    async get(k) {
      const v = m.get(k);
      return v === undefined ? null : v;
    },
    async set(k, v) {
      m.set(k, String(v));
      return 'OK';
    },
    async incr(k) {
      const n = Number(m.get(k) || 0) + 1;
      m.set(k, String(n));
      return n;
    },
    async hget(k, f) {
      const x = m.get(k);
      return x instanceof Map && x.has(f) ? x.get(f) : null;
    },
    async hset(k, obj) {
      const x = hash(k);
      for (const [f, v] of Object.entries(obj)) x.set(f, String(v));
      return 1;
    },
    async hdel(k, ...fields) {
      const x = m.get(k);
      if (x instanceof Map) fields.forEach((f) => x.delete(f));
      return 1;
    },
    async hgetall(k) {
      const x = m.get(k);
      if (!(x instanceof Map) || !x.size) return null;
      return Object.fromEntries(x);
    },
  };
}

// Raw mode returns HGETALL as a flat [field, value, ...] array – normalize it to an object
function upstash() {
  const r = new Redis({ url, token, automaticDeserialization: false, enableAutoPipelining: true });
  return {
    get: (k) => r.get(k),
    set: (k, v) => r.set(k, v),
    incr: (k) => r.incr(k),
    hget: (k, f) => r.hget(k, f),
    hset: (k, obj) => r.hset(k, obj),
    hdel: (k, ...f) => r.hdel(k, ...f),
    async hgetall(k) {
      const x = await r.hgetall(k);
      if (!x) return null;
      if (!Array.isArray(x)) return x;
      if (!x.length) return null;
      const o = {};
      for (let i = 0; i + 1 < x.length; i += 2) o[x[i]] = x[i + 1];
      return o;
    },
  };
}

export const db = hasDb ? upstash() : memory();
