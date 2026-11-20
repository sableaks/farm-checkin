'use client';
import { memo, useEffect, useMemo, useState } from 'react';
import { MONTHS, WEEKDAYS, clock, dayKey, hDec, hm } from '@/lib/time';
import { evLabel } from './ui';

function shift(ym, d) {
  let [y, m] = ym.split('-').map(Number);
  m += d;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function Calendar({ workerId, log, liveTodaySec = 0, editable = false, onSetDay }) {
  const today = dayKey(Date.now());
  const [ym, setYm] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(null);
  const [events, setEvents] = useState(null);
  const [edit, setEdit] = useState('');
  const [saving, setSaving] = useState(false);

  const [y, m] = ym.split('-').map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;

  const secFor = (d) => {
    const base = log?.[d]?.w || 0;
    return d === today ? Math.max(base, liveTodaySec) : base;
  };

  const { cells, total, daysWorked } = useMemo(() => {
    const cells = [];
    let total = 0;
    let daysWorked = 0;
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) {
      const key = `${ym}-${String(d).padStart(2, '0')}`;
      const sec = secFor(key);
      total += sec;
      if (sec > 60) daysWorked++;
      cells.push({ d, key, sec });
    }
    return { cells, total, daysWorked };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, log, liveTodaySec, lead, daysIn]);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    setEvents(null);
    fetch(`/api/day?w=${encodeURIComponent(workerId)}&d=${sel}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => alive && setEvents(d.events || []))
      .catch(() => alive && setEvents([]));
    const sec = log?.[sel]?.w || 0;
    setEdit(sec ? String(Math.round((sec / 3600) * 100) / 100) : '');
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, workerId]);

  const selInfo = sel ? log?.[sel] : null;

  async function saveDay() {
    if (!onSetDay) return;
    setSaving(true);
    try {
      const h = parseFloat(String(edit).replace(',', '.')) || 0;
      await onSetDay(workerId, sel, Math.round(h * 60));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => { setYm(shift(ym, -1)); setSel(null); }} aria-label="Предишен месец">‹</button>
        <div className="cal-title">{MONTHS[m - 1]} {y}</div>
        <button className="icon-btn" onClick={() => { setYm(shift(ym, 1)); setSel(null); }} aria-label="Следващ месец">›</button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-wd">{w}</div>
        ))}
        {cells.map((c, i) =>
          c ? (
            <button
              key={c.key}
              className={`cal-day${c.key === today ? ' is-today' : ''}${c.key === sel ? ' is-sel' : ''}${c.sec > 60 ? ' has' : ''}${c.sec > 3.5 * 3600 ? ' hi' : ''}`}
              style={{ '--lvl': Math.min(1, c.sec / (9 * 3600)) }}
              onClick={() => setSel(c.key === sel ? null : c.key)}
            >
              <span className="cal-n">{c.d}</span>
              <span className="cal-h">{c.sec > 60 ? `${hDec(c.sec)}ч` : ''}</span>
            </button>
          ) : (
            <div key={`e${i}`} />
          )
        )}
      </div>
      <div className="cal-foot">
        <span>Общо: <b>{hm(total)}</b></span>
        <span>Дни: <b>{daysWorked}</b></span>
      </div>

      {sel && (
        <div className="day-detail fade-in">
          <div className="day-detail-h">
            <b>{sel.split('-').reverse().join('.')}</b>
            <span className="muted">
              {hm(secFor(sel))} работа
              {selInfo?.b ? ` · ${hm(selInfo.b)} почивка` : ''}
              {selInfo?.n ? ` · ${selInfo.n} почивки` : ''}
              {selInfo?.edited ? ' · коригирано' : ''}
            </span>
          </div>
          {events === null ? (
            <div className="muted small">Зареждане…</div>
          ) : events.length ? (
            <ul className="timeline">
              {events.map((e, i) => (
                <li key={i} className={`tl-${e.t}`}>
                  <span className="tl-time">{clock(e.at)}</span>
                  <span>{evLabel(e.t)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted small">Няма записи за този ден.</div>
          )}
          {editable && (
            <div className="day-edit">
              <label>
                Коригирай часове
                <input inputMode="decimal" value={edit} onChange={(e) => setEdit(e.target.value)} placeholder="напр. 8 или 7.5" />
              </label>
              <button className="btn btn-sm btn-green" disabled={saving} onClick={saveDay}>
                {saving ? '…' : 'Запази'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(Calendar);
