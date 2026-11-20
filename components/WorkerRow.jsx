'use client';
import { memo, useEffect, useState } from 'react';
import { useNow } from '@/lib/client';
import { hm, liveTotals, timer } from '@/lib/time';
import { Avatar, StatusPill } from './ui';
import Calendar from './Calendar';

function WorkerRow({ worker, status, log, settings, open, onToggle, isMe, extra }) {
  const now = useNow();
  const t = liveTotals(status, log, now);
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  const state = status?.state || 'off';
  const overBreak =
    state === 'break' && settings?.breakMaxMin > 0 && t.elapsed > settings.breakMaxMin * 60;

  return (
    <div className={`row card state-${state}${open ? ' open' : ''}`}>
      <button className="row-main" onClick={() => onToggle(worker.id)} aria-expanded={open}>
        <Avatar id={worker.id} name={worker.name} />
        <div className="row-info">
          <div className="row-name">
            {worker.name}
            {isMe && <span className="me-tag">ти</span>}
          </div>
          <div className="row-sub">
            <StatusPill state={state} />
            {state !== 'off' && (
              <span className={`row-timer${overBreak ? ' danger' : ''}`}>{timer(t.elapsed)}</span>
            )}
          </div>
        </div>
        <div className="row-today">
          <div className="row-today-v">{hm(t.w)}</div>
          <div className="row-today-l">днес</div>
        </div>
        <svg className="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {extra}
      <div className="collapse" data-open={open}>
        <div className="collapse-in">
          {mounted && (
            <Calendar
              workerId={worker.id}
              log={log}
              liveTodaySec={Math.floor(t.w / 60) * 60}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(WorkerRow);
