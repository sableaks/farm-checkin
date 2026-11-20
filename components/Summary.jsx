'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { post, useMinute } from '@/lib/client';
import { MONTHS, WEEKDAYS, clock, dayKey, hDec, hm, liveTotals } from '@/lib/time';
import { Avatar, StatusPill } from './ui';

const pad = (n) => String(n).padStart(2, '0');
const WD_FULL = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];

function shiftYm(ym, d) {
  let [y, m] = ym.split('-').map(Number);
  m += d;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${pad(m)}`;
}
const minOfDay = (ts) => {
  const [h, m] = clock(ts).split(':').map(Number);
  return h * 60 + m;
};
const fmtMin = (m) => {
  m = Math.round(m);
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
};
const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const weekdayIdx = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};
// upToDay: only count days 1..upToDay (to compare a running month with the same period before)
const monthTotal = (log, ym, upToDay = 31) => {
  let s = 0;
  for (const [d, v] of Object.entries(log || {})) {
    if (d.startsWith(ym) && Number(d.slice(8)) <= upToDay) s += v?.w || 0;
  }
  return s;
};

/* ---------------- build the per-day rows + stats ---------------- */
function analyse({ log, events, ym, today, live, breakMaxMin }) {
  const [y, m] = ym.split('-').map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const rows = [];
  const breakDur = [];
  let overBreaks = 0;

  for (let d = 1; d <= daysIn; d++) {
    const key = `${ym}-${pad(d)}`;
    const sum = log?.[key];
    const ev = events?.[key] || [];
    const isToday = key === today;
    const w = isToday ? Math.max(sum?.w || 0, live.w) : sum?.w || 0;
    const b = isToday ? Math.max(sum?.b || 0, live.b) : sum?.b || 0;
    const n = sum?.n || 0;

    let start = null;
    let end = null;
    let bsAt = null;
    let adminOut = false;
    const dayBreaks = [];
    for (const e of ev) {
      if (e.t === 'in') {
        if (start === null) start = e.at;
        end = null;
      } else if (e.t === 'bs') {
        bsAt = e.at;
      } else if (e.t === 'be' || e.t === 'out' || e.t === 'aout') {
        if (bsAt !== null) {
          dayBreaks.push((e.at - bsAt) / 1000);
          bsAt = null;
        }
        if (e.t !== 'be') end = e.at;
        if (e.t === 'aout') adminOut = true;
      }
    }
    for (const s of dayBreaks) {
      breakDur.push(s);
      if (breakMaxMin > 0 && s > breakMaxMin * 60) overBreaks++;
    }
    const open = isToday && live.state !== 'off';
    rows.push({ key, d, wd: weekdayIdx(key), w, b, n, start, end, open, adminOut, edited: !!sum?.edited, isToday });
  }

  const worked = rows.filter((r) => r.w > 60);
  const total = rows.reduce((a, r) => a + r.w, 0);
  const totalBreak = rows.reduce((a, r) => a + r.b, 0);
  const breaks = rows.reduce((a, r) => a + r.n, 0);
  const longest = worked.reduce((a, r) => (!a || r.w > a.w ? r : a), null);
  const shortest = worked.reduce((a, r) => (!a || r.w < a.w ? r : a), null);
  const starts = worked.filter((r) => r.start).map((r) => minOfDay(r.start));
  const ends = worked.filter((r) => r.end && !r.open).map((r) => minOfDay(r.end));
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  // per weekday averages
  const byWd = Array.from({ length: 7 }, () => ({ sec: 0, days: 0 }));
  worked.forEach((r) => {
    byWd[r.wd].sec += r.w;
    byWd[r.wd].days += 1;
  });

  // per week (Mon–Sun) totals inside the month
  const weeks = [];
  rows.forEach((r) => {
    if (!weeks.length || r.wd === 0) weeks.push({ from: r.d, to: r.d, sec: 0, days: 0 });
    const wk = weeks[weeks.length - 1];
    wk.to = r.d;
    wk.sec += r.w;
    if (r.w > 60) wk.days += 1;
  });

  return {
    rows,
    worked,
    total,
    totalBreak,
    breaks,
    longest,
    shortest,
    avgDay: worked.length ? total / worked.length : 0,
    avgStart: avg(starts),
    avgEnd: avg(ends),
    avgBreak: avg(breakDur),
    overBreaks,
    adminOuts: rows.filter((r) => r.adminOut).length,
    edited: rows.filter((r) => r.edited).length,
    byWd,
    weeks,
  };
}

/* ---------------- daily bar chart (plain SVG, no library) ---------------- */
const DayChart = memo(function DayChart({ rows, avgDay, ym }) {
  const [hover, setHover] = useState(null);
  const wrap = useRef(null);
  const W = 720;
  const H = 210;
  const L = 30;
  const R = 8;
  const T = 14;
  const B = 24;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const maxH = Math.max(8, Math.ceil(Math.max(...rows.map((r) => r.w / 3600), 0)));
  const step = maxH > 12 ? 4 : 2;
  const colW = plotW / rows.length;
  const barW = Math.max(4, colW - 2);
  const yOf = (h) => T + plotH - (h / maxH) * plotH;
  const ticks = [];
  for (let h = 0; h <= maxH; h += step) ticks.push(h);
  const avgH = avgDay / 3600;
  const hr = hover !== null ? rows[hover] : null;

  return (
    <div className="chart-scroll">
    <div className="chart" ref={wrap} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Часове по дни, ${monthLabel(ym)}`}>
        {ticks.map((h) => (
          <g key={h}>
            <line x1={L} x2={W - R} y1={yOf(h)} y2={yOf(h)} className="grid" />
            <text x={L - 6} y={yOf(h) + 4} className="axis" textAnchor="end">{h}ч</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = L + i * colW + (colW - barW) / 2;
          const hgt = (r.w / 3600 / maxH) * plotH;
          const y = T + plotH - hgt;
          return (
            <g key={r.key}>
              {r.wd >= 5 && <rect x={L + i * colW} y={T} width={colW} height={plotH} className="weekend" />}
              {hgt > 0.5 && (
                <path
                  className={`bar${r.isToday ? ' today' : ''}${hover === i ? ' hl' : ''}`}
                  d={`M${x},${T + plotH} V${y + Math.min(4, hgt)} Q${x},${y} ${x + Math.min(4, barW / 2)},${y} H${x + barW - Math.min(4, barW / 2)} Q${x + barW},${y} ${x + barW},${y + Math.min(4, hgt)} V${T + plotH} Z`}
                />
              )}
              {(r.d === 1 || r.d % 5 === 0 || r.isToday) && (
                <text x={L + i * colW + colW / 2} y={H - 6} className={`axis${r.isToday ? ' strong' : ''}`} textAnchor="middle">
                  {r.d}
                </text>
              )}
              <rect
                x={L + i * colW}
                y={T}
                width={colW}
                height={plotH + B}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(hover === i ? null : i)}
              />
            </g>
          );
        })}
        {avgH > 0 && (
          <g pointerEvents="none">
            <line x1={L} x2={W - R} y1={yOf(avgH)} y2={yOf(avgH)} className="avg" />
            <text x={W - R} y={yOf(avgH) - 5} className="axis strong" textAnchor="end">
              средно {hDec(avgDay)}ч
            </text>
          </g>
        )}
        <line x1={L} x2={W - R} y1={T + plotH} y2={T + plotH} className="base" />
      </svg>
      {hr && (
        <div
          className="tip"
          style={{ left: `${((L + hover * colW + colW / 2) / W) * 100}%` }}
        >
          <b>{WD_FULL[hr.wd]}, {hr.d}.{ym.slice(5)}</b>
          <span>{hr.w > 60 ? hm(hr.w) + ' работа' : 'Не е работил'}</span>
          {hr.start && (
            <span>
              {clock(hr.start)} – {hr.open ? 'сега' : hr.end ? clock(hr.end) : '?'}
            </span>
          )}
          {hr.n > 0 && <span>{hr.n} почивки · {hm(hr.b)}</span>}
        </div>
      )}
    </div>
    </div>
  );
});

function Bars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbars">
      {items.map((i) => (
        <div key={i.label} className="hbar">
          <span className="hbar-l">{i.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ transform: `scaleX(${i.value / max})` }} />
          </span>
          <span className="hbar-v">{i.text}</span>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`kpi card${tone ? ' ' + tone : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/* ---------------- detail view for one worker ---------------- */
function Detail({ worker, data, ym, setYm, adminKey, onBack }) {
  const now = useMinute();
  const today = dayKey(now || Date.now());
  const isCurrent = today.startsWith(ym);
  const log = data.logs[worker.id];
  const st = data.status[worker.id];
  const live = { ...liveTotals(st, log, now || Date.now()), state: st?.state || 'off' };
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState('');
  const cache = useRef(new Map());

  // re-fetch events when month/worker changes, and when live data changes in the current month
  const ver = isCurrent ? data.v : 0;
  useEffect(() => {
    const k = `${worker.id}|${ym}|${ver}`;
    if (cache.current.has(k)) {
      setEvents(cache.current.get(k));
      return;
    }
    let alive = true;
    setErr('');
    post('/api/admin/month', { id: worker.id, ym }, { 'x-admin-key': adminKey || '' })
      .then((d) => {
        cache.current.set(k, d.events || {});
        if (alive) setEvents(d.events || {});
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [worker.id, ym, ver, adminKey]);

  const a = useMemo(
    () =>
      analyse({
        log,
        events: events || {},
        ym,
        today,
        live,
        breakMaxMin: data.settings.breakMaxMin,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [log, events, ym, today, Math.floor(live.w / 60), Math.floor(live.b / 60), live.state, data.settings.breakMaxMin]
  );

  const prevYm = shiftYm(ym, -1);
  const upTo = isCurrent ? Number(today.slice(8)) : 31;
  const prev = monthTotal(log, prevYm, upTo);
  const diff = a.total - prev;
  const prevName = MONTHS[Number(prevYm.slice(5)) - 1].toLowerCase();

  function csv() {
    const head = ['Дата', 'Ден', 'Начало', 'Край', 'Работа (ч)', 'Почивка (мин)', 'Почивки', 'Бележка'];
    const lines = [head];
    a.rows.forEach((r) => {
      if (r.w <= 60 && !r.start) return;
      lines.push([
        `${pad(r.d)}.${ym.slice(5)}.${ym.slice(0, 4)}`,
        WD_FULL[r.wd],
        r.start ? clock(r.start) : '',
        r.open ? 'сега' : r.end ? clock(r.end) : '',
        (r.w / 3600).toFixed(2).replace('.', ','),
        String(Math.round(r.b / 60)),
        String(r.n),
        [r.edited && 'коригирано', r.adminOut && 'приключен от админ'].filter(Boolean).join(', '),
      ]);
    });
    lines.push(['Общо', '', '', '', (a.total / 3600).toFixed(2).replace('.', ','), String(Math.round(a.totalBreak / 60)), String(a.breaks), '']);
    const text = '﻿' + lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const el = document.createElement('a');
    el.href = url;
    el.download = `${worker.name.replace(/\s+/g, '_')}_${ym}.csv`;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="summary fade-in">
      <div className="sum-head card">
        <button className="link no-print" onClick={onBack}>← Всички</button>
        <div className="sum-who">
          <Avatar id={worker.id} name={worker.name} size={48} />
          <div>
            <div className="me-name">{worker.name}</div>
            <StatusPill state={st?.state || 'off'} />
          </div>
        </div>
        <div className="month-nav">
          <button className="icon-btn no-print" onClick={() => setYm(shiftYm(ym, -1))} aria-label="Предишен месец">‹</button>
          <b>{monthLabel(ym)}</b>
          <button className="icon-btn no-print" onClick={() => setYm(shiftYm(ym, 1))} aria-label="Следващ месец">›</button>
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="kpi-grid">
        <Kpi
          label="Общо изработено"
          value={hm(a.total)}
          sub={
            prev > 0
              ? `${diff >= 0 ? '▲' : '▼'} ${hm(Math.abs(diff))} спрямо ${isCurrent ? `1–${upTo} ${prevName}` : prevName}`
              : 'няма данни за предходния месец'
          }
          tone="hero"
        />
        <Kpi label="Работни дни" value={a.worked.length} sub={`от ${a.rows.length} дни в месеца`} />
        <Kpi label="Средно на работен ден" value={hm(a.avgDay)} />
        <Kpi
          label="Най-дълъг ден"
          value={a.longest ? hm(a.longest.w) : '—'}
          sub={a.longest ? `${a.longest.d}.${ym.slice(5)} (${WEEKDAYS[a.longest.wd]})` : ''}
        />
        <Kpi label="Средно започва" value={a.avgStart !== null ? fmtMin(a.avgStart) : '—'} />
        <Kpi label="Средно приключва" value={a.avgEnd !== null ? fmtMin(a.avgEnd) : '—'} />
        <Kpi label="Почивки" value={a.breaks} sub={`общо ${hm(a.totalBreak)}${a.avgBreak ? ` · средно ${hm(a.avgBreak)}` : ''}`} />
        <Kpi
          label="Превишени почивки"
          value={data.settings.breakMaxMin > 0 ? a.overBreaks : '—'}
          sub={data.settings.breakMaxMin > 0 ? `над ${data.settings.breakMaxMin} мин` : 'няма лимит'}
          tone={a.overBreaks > 0 ? 'warn' : ''}
        />
      </div>

      <div className="card pad">
        <div className="sec-h">
          <h3>Часове по дни</h3>
          <span className="muted small">почивните дни са с фон</span>
        </div>
        <DayChart rows={a.rows} avgDay={a.avgDay} ym={ym} />
      </div>

      <div className="two-col">
        <div className="card pad">
          <h3>Средно по дни от седмицата</h3>
          <Bars
            items={a.byWd.map((x, i) => ({
              label: WEEKDAYS[i],
              value: x.days ? x.sec / x.days : 0,
              text: x.days ? `${hm(x.sec / x.days)} · ${x.days} д.` : '—',
            }))}
          />
        </div>
        <div className="card pad">
          <h3>По седмици</h3>
          <Bars
            items={a.weeks.map((wk) => ({
              label: wk.from === wk.to ? `${wk.from}` : `${wk.from}–${wk.to}`,
              value: wk.sec,
              text: wk.sec > 60 ? `${hm(wk.sec)} · ${wk.days} д.` : '—',
            }))}
          />
        </div>
      </div>

      <div className="card pad">
        <div className="sec-h">
          <h3>Ден по ден</h3>
          <div className="row-btns no-print">
            <button className="btn btn-sm btn-ghost" onClick={csv}>Изтегли CSV</button>
            <button className="btn btn-sm btn-ghost" onClick={() => window.print()}>Принтирай</button>
          </div>
        </div>
        {events === null && !err ? (
          <div className="muted small">Зареждане…</div>
        ) : a.worked.length === 0 ? (
          <div className="muted small">Няма работни дни този месец.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl tbl-days">
              <thead>
                <tr>
                  <th>Дата</th><th>Начало</th><th>Край</th><th>Работа</th><th>Почивка</th><th>Бележка</th>
                </tr>
              </thead>
              <tbody>
                {a.rows
                  .filter((r) => r.w > 60 || r.start)
                  .map((r) => (
                    <tr key={r.key} className={r.isToday ? 'is-today' : ''}>
                      <td>
                        <b>{r.d}.{ym.slice(5)}</b> <span className="muted">{WEEKDAYS[r.wd]}</span>
                      </td>
                      <td>{r.start ? clock(r.start) : '—'}</td>
                      <td>{r.open ? <span className="live-txt">сега</span> : r.end ? clock(r.end) : '—'}</td>
                      <td><b>{hm(r.w)}</b></td>
                      <td>{r.n ? `${hm(r.b)} (${r.n})` : '—'}</td>
                      <td className="muted small">
                        {[r.edited && 'коригирано', r.adminOut && 'приключен от админ'].filter(Boolean).join(', ')}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Общо</td><td /><td /><td><b>{hm(a.total)}</b></td><td>{hm(a.totalBreak)} ({a.breaks})</td><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- list of workers ---------------- */
export default function Summary({ data, adminKey }) {
  const now = useMinute();
  const [sel, setSel] = useState(null);
  const [ym, setYm] = useState(() => dayKey(Date.now()).slice(0, 7));
  const worker = data.workers.find((w) => w.id === sel);

  useEffect(() => {
    if (sel && !worker) setSel(null);
  }, [sel, worker]);

  if (worker) {
    return (
      <Detail
        worker={worker}
        data={data}
        ym={ym}
        setYm={setYm}
        adminKey={adminKey}
        onBack={() => setSel(null)}
      />
    );
  }

  const today = dayKey(now || Date.now());
  return (
    <section className="fade-in">
      <div className="sum-list-h">
        <h2>Резюме на работник</h2>
        <div className="month-nav">
          <button className="icon-btn" onClick={() => setYm(shiftYm(ym, -1))} aria-label="Предишен месец">‹</button>
          <b>{monthLabel(ym)}</b>
          <button className="icon-btn" onClick={() => setYm(shiftYm(ym, 1))} aria-label="Следващ месец">›</button>
        </div>
      </div>
      {data.workers.length === 0 && <div className="empty card">Няма работници.</div>}
      <div className="sum-grid">
        {data.workers.map((w, i) => {
          const log = data.logs[w.id] || {};
          let total = 0;
          let days = 0;
          for (const [d, v] of Object.entries(log)) {
            if (!d.startsWith(ym)) continue;
            let s = v?.w || 0;
            if (d === today) s = Math.max(s, liveTotals(data.status[w.id], log, now || Date.now()).w);
            total += s;
            if (s > 60) days++;
          }
          return (
            <button key={w.id} className="sum-card card stagger" style={{ '--i': i }} onClick={() => setSel(w.id)}>
              <Avatar id={w.id} name={w.name} size={42} />
              <div className="sum-card-i">
                <b>{w.name}</b>
                <span className="muted small">{days} работни дни</span>
              </div>
              <div className="sum-card-v">
                <b>{hm(total)}</b>
                <span className="muted small">общо</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="muted small center-t">Натисни работник за подробен отчет за месеца.</p>
    </section>
  );
}
