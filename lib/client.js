'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TZ } from './time';

let offset = 0; // server time - local time
export const serverNow = () => Date.now() + offset;

/* ---------------- one shared 1s ticker for every live timer on the page ---------------- */
// Only components that actually show a running clock subscribe, so the rest of the page
// never re-renders once per second. The ticker stops while the tab is hidden.
const subs = new Set();
let tickNow = Date.now();
let tickId = null;
function startTicker() {
  if (tickId || typeof document === 'undefined' || document.hidden) return;
  tickNow = serverNow();
  tickId = setInterval(() => {
    tickNow = serverNow();
    subs.forEach((f) => f());
  }, 1000);
}
function stopTicker() {
  clearInterval(tickId);
  tickId = null;
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTicker();
    else if (subs.size) {
      startTicker();
      tickNow = serverNow();
      subs.forEach((f) => f());
    }
  });
}
function subscribe(f) {
  subs.add(f);
  startTicker();
  return () => {
    subs.delete(f);
    if (!subs.size) stopTicker();
  };
}
export function useNow() {
  return useSyncExternalStore(subscribe, () => tickNow, () => 0);
}
// Same clock, but the component only re-renders when the minute changes
const minuteSnap = () => Math.floor(tickNow / 60000) * 60000;
export function useMinute() {
  return useSyncExternalStore(subscribe, minuteSnap, () => 0);
}

/* ---------------- adaptive polling ---------------- */
// Busy (someone on shift, or the screen was just used): every 4s.
// Quiet daytime: every 20s. Quiet night (22:00–05:00): every 60s. Hidden tab: paused.
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });
let lastInteract = Date.now();
if (typeof window !== 'undefined') {
  const mark = () => (lastInteract = Date.now());
  window.addEventListener('pointerdown', mark, { passive: true });
  window.addEventListener('keydown', mark, { passive: true });
}

function pollDelay(data) {
  const busy =
    Date.now() - lastInteract < 120000 ||
    (data && Object.values(data.status || {}).some((s) => s && s.state && s.state !== 'off'));
  if (busy) return 4000;
  const h = Number(hourFmt.format(new Date()));
  return h >= 22 || h < 5 ? 60000 : 20000;
}

export function useFarm() {
  const [data, setData] = useState(null);
  const [online, setOnline] = useState(true);
  const vRef = useRef(null);
  const dataRef = useRef(null);
  const buildRef = useRef(null);
  const kickRef = useRef(() => {});

  const apply = useCallback((d) => {
    if (!d) return;
    if (d.now) offset = d.now - Date.now();
    if (d.build) {
      // a new version of the site was deployed: reload when nobody is touching the screen
      if (buildRef.current && buildRef.current !== d.build && Date.now() - lastInteract > 30000) {
        window.location.reload();
        return;
      }
      buildRef.current = buildRef.current || d.build;
    }
    if (!d.same && d.workers) {
      vRef.current = d.v;
      dataRef.current = d;
      setData(d);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer;
    let inflight = false;
    let fails = 0;

    const tick = async () => {
      clearTimeout(timer);
      if (stopped || document.hidden) return;
      if (inflight) return;
      inflight = true;
      try {
        const q = vRef.current !== null ? `?v=${vRef.current}` : '';
        const r = await fetch(`/api/state${q}`, { cache: 'no-store' });
        if (!r.ok) throw new Error('bad');
        apply(await r.json());
        setOnline(true);
        fails = 0;
      } catch {
        setOnline(false);
        fails = Math.min(fails + 1, 5);
      }
      inflight = false;
      if (!stopped && !document.hidden) {
        const delay = fails ? Math.min(60000, 3000 * 2 ** fails) : pollDelay(dataRef.current);
        timer = setTimeout(tick, delay);
      }
    };
    kickRef.current = tick;

    tick();
    const onVis = () => {
      if (!document.hidden) tick();
      else clearTimeout(timer);
    };
    const onOnline = () => tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      window.removeEventListener('online', onOnline);
    };
  }, [apply]);

  return { data, online, apply };
}

export function useStored(key, initial) {
  const [val, setVal] = useState(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s !== null) setVal(JSON.parse(s));
    } catch {}
  }, [key]);
  const set = useCallback(
    (v) => {
      setVal(v);
      try {
        if (v === null || v === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(v));
      } catch {}
    },
    [key]
  );
  return [val, set];
}

export async function post(url, body, headers = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let d = {};
  try {
    d = await r.json();
  } catch {}
  if (!r.ok) throw new Error(d.error || 'Грешка при връзката');
  return d;
}

export const buzz = () => {
  try {
    navigator.vibrate && navigator.vibrate(15);
  } catch {}
};
