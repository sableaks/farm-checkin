import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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

export const db = hasDb
  ? new Redis({ url, token, automaticDeserialization: false, enableAutoPipelining: true })
  : memory();
