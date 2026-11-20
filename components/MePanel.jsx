'use client';
import { useEffect, useRef, useState } from 'react';
import { buzz, post, useNow } from '@/lib/client';
import { clock, hm, liveTotals, timer } from '@/lib/time';
import { Avatar, StatusPill } from './ui';

export default function MePanel({ worker, status, log, settings, apply, onChange }) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);
  const confirmTimer = useRef();
  const state = status?.state || 'off';
  const t = liveTotals(status, log, now);

  useEffect(() => () => clearTimeout(confirmTimer.current), []);
  useEffect(() => {
    setErr('');
    setConfirmOut(false);
  }, [state]);

  // break rules
  const maxB = settings.maxBreaks;
  const breaksLeft = maxB === null ? Infinity : Math.max(0, maxB - t.n);
  const cdLeft = Math.max(0, (status?.lastBreakEnd || 0) + settings.cooldownMin * 60000 - now);
  const canBreak = state === 'working' && breaksLeft > 0 && cdLeft <= 0;
  const breakOver = state === 'break' && settings.breakMaxMin > 0 && t.elapsed > settings.breakMaxMin * 60;
  const breakLeftSec = state === 'break' && settings.breakMaxMin > 0 ? settings.breakMaxMin * 60 - t.elapsed : null;

  async function act(action) {
    if (busy) return;
    buzz();
    setBusy(true);
    setErr('');
    try {
      apply(await post('/api/action', { workerId: worker.id, action }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function tapOut() {
    if (!confirmOut) {
      setConfirmOut(true);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmOut(false), 3500);
      return;
    }
    setConfirmOut(false);
    act('out');
  }

  let breakHint = '';
  if (state === 'working') {
    if (maxB === 0) breakHint = 'Почивките са изключени';
    else if (breaksLeft <= 0) breakHint = 'Няма оставащи почивки днес';
    else if (cdLeft > 0) breakHint = `Почивка след ${timer(cdLeft / 1000)}`;
  }

  return (
    <section className={`me card state-${state}`}>
      <div className="me-top">
        <Avatar id={worker.id} name={worker.name} size={52} />
        <div className="me-who">
          <div className="me-name">{worker.name}</div>
          <StatusPill state={state} />
        </div>
        <button className="link" onClick={onChange}>Смени</button>
      </div>

      <div className="me-clock">
        <div className={`big-timer${breakOver ? ' danger' : ''}`}>
          {state === 'break' ? timer(t.elapsed) : timer(t.w)}
        </div>
        <div className="big-label">
          {state === 'off' && 'изработено днес'}
          {state === 'working' && 'изработено днес · таймерът върви'}
          {state === 'break' &&
            (breakLeftSec === null
              ? 'в почивка'
              : breakOver
              ? `почивката е превишена с ${hm(-breakLeftSec)}`
              : `остават ${timer(breakLeftSec)} почивка`)}
        </div>
      </div>

      <div className="me-stats">
        <div>
          <b>{state !== 'off' && status?.startedAt ? clock(status.startedAt) : '—'}</b>
          <span>започна в</span>
        </div>
        <div><b>{hm(t.b)}</b><span>почивка</span></div>
        <div>
          <b>{t.n}{maxB === null ? '' : `/${maxB}`}</b>
          <span>почивки</span>
        </div>
      </div>

      <div className="me-actions">
        {state === 'off' && (
          <button className="btn btn-xl btn-green" disabled={busy} onClick={() => act('in')}>
            {busy ? <span className="spinner sm" /> : 'Започни работа'}
          </button>
        )}
        {state === 'working' && (
          <>
            <button className="btn btn-xl btn-amber" disabled={busy || !canBreak} onClick={() => act('break')}>
              {busy ? <span className="spinner sm" /> : 'Почивка'}
            </button>
            <button className={`btn btn-xl btn-red-o${confirmOut ? ' confirm' : ''}`} disabled={busy} onClick={tapOut}>
              {confirmOut ? 'Натисни пак за край' : 'Приключи'}
            </button>
          </>
        )}
        {state === 'break' && (
          <>
            <button className="btn btn-xl btn-green" disabled={busy} onClick={() => act('resume')}>
              {busy ? <span className="spinner sm" /> : 'Обратно на работа'}
            </button>
            <button className={`btn btn-xl btn-red-o${confirmOut ? ' confirm' : ''}`} disabled={busy} onClick={tapOut}>
              {confirmOut ? 'Натисни пак за край' : 'Приключи'}
            </button>
          </>
        )}
      </div>
      {breakHint && <div className="hint">{breakHint}</div>}
      {err && <div className="err fade-in">{err}</div>}
    </section>
  );
}
