'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

let offset = 0; // server time - local time
export const serverNow = () => Date.now() + offset;

const POLL_MS = 2000;

export function useFarm() {
  const [data, setData] = useState(null);
  const [online, setOnline] = useState(true);
  const vRef = useRef(null);

  const apply = useCallback((d) => {
    if (!d) return;
    if (d.now) offset = d.now - Date.now();
    if (!d.same && d.workers) {
      vRef.current = d.v;
      setData(d);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer;
    let inflight = false;

    const tick = async () => {
      clearTimeout(timer);
      if (stopped) return;
      if (document.hidden || inflight) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      inflight = true;
      try {
        const q = vRef.current !== null ? `?v=${vRef.current}` : '';
        const r = await fetch(`/api/state${q}`, { cache: 'no-store' });
        if (!r.ok) throw new Error('bad');
        apply(await r.json());
        setOnline(true);
      } catch {
        setOnline(false);
      }
      inflight = false;
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    const onVis = () => !document.hidden && tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [apply]);

  return { data, online, apply };
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
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
