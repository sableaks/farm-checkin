'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useFarm, useNow, useStored, post } from '@/lib/client';
import { dayKey, hm, liveTotals, timer } from '@/lib/time';
import { Avatar, Header, Splash, StatusPill } from '@/components/ui';
import Calendar from '@/components/Calendar';

const TABS = [
  ['live', 'На живо'],
  ['workers', 'Работници'],
  ['calendar', 'Календар'],
  ['settings', 'Настройки'],
];

export default function Admin() {
  const { data, online, apply } = useFarm();
  const now = useNow();
  const [key, setKey] = useStored('farm-admin', null);
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState('live');
  const [toast, setToast] = useState(null);

  const call = useCallback(
    async (body) => {
      try {
        const d = await post('/api/admin', body, { 'x-admin-key': key || '' });
        apply(d);
        return d;
      } catch (e) {
        setToast({ t: e.message, bad: true, id: Date.now() });
        if (/парола/i.test(e.message)) {
          setAuthed(false);
          setKey(null);
        }
        throw e;
      }
    },
    [key, apply, setKey]
  );

  useEffect(() => {
    if (!key) return;
    post('/api/admin', { action: 'ping' }, { 'x-admin-key': key })
      .then((d) => {
        apply(d);
        setAuthed(true);
      })
      .catch(() => {
        setAuthed(false);
        setKey(null);
      });
  }, [key, apply, setKey]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const ok = (t) => setToast({ t, bad: false, id: Date.now() });

  if (!authed) return <Login onKey={setKey} hasKey={!!key} />;
  if (!data) return <Splash />;

  return (
    <main className="wrap wide">
      <Header
        online={online}
        now={now}
        right={
          <button className="link" onClick={() => { setKey(null); setAuthed(false); }}>
            Изход
          </button>
        }
      />
      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div key={tab} className="fade-in">
        {tab === 'live' && <Live data={data} now={now} call={call} ok={ok} />}
        {tab === 'workers' && <Workers data={data} call={call} ok={ok} />}
        {tab === 'calendar' && <Cal data={data} now={now} call={call} ok={ok} />}
        {tab === 'settings' && <Settings data={data} call={call} ok={ok} />}
      </div>

      <footer className="foot">
        <Link href="/">← Към чекването</Link>
      </footer>

      {toast && (
        <div key={toast.id} className={`toast${toast.bad ? ' bad' : ''}`}>{toast.t}</div>
      )}
    </main>
  );
}

function Login({ onKey, hasKey }) {
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await post('/api/admin', { action: 'ping' }, { 'x-admin-key': p });
      onKey(p);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (hasKey) return <Splash />;
  return (
    <main className="wrap center">
      <form className="card login fade-in" onSubmit={submit}>
        <h2>Админ вход</h2>
        <input type="password" autoFocus placeholder="Парола" value={p} onChange={(e) => setP(e.target.value)} />
        <button className="btn btn-green btn-lg" disabled={busy || !p}>{busy ? '…' : 'Влез'}</button>
        {err && <div className="err">{err}</div>}
        <Link href="/" className="link mt">← Назад</Link>
      </form>
    </main>
  );
}

function Live({ data, now, call, ok }) {
  const { workers, status, logs, settings } = data;
  const [confirm, setConfirm] = useState(null);
  const today = dayKey(now);
  let teamToday = 0;
  workers.forEach((w) => (teamToday += liveTotals(status[w.id], logs[w.id], now).w));
  const active = workers.filter((w) => (status[w.id]?.state || 'off') !== 'off').length;

  return (
    <section>
      <div className="kpis">
        <div className="kpi card"><b>{active}</b><span>на работа сега</span></div>
        <div className="kpi card"><b>{hm(teamToday)}</b><span>общо днес</span></div>
        <div className="kpi card"><b>{workers.length}</b><span>работници</span></div>
      </div>
      <div className="rows">
        {workers.length === 0 && <div className="empty card">Добави работници от таб „Работници“.</div>}
        {workers.map((w, i) => {
          const st = status[w.id];
          const state = st?.state || 'off';
          const t = liveTotals(st, logs[w.id], now);
          const over = state === 'break' && settings.breakMaxMin > 0 && t.elapsed > settings.breakMaxMin * 60;
          return (
            <div key={w.id} className={`row card state-${state} stagger`} style={{ '--i': i }}>
              <div className="row-main static">
                <Avatar id={w.id} name={w.name} />
                <div className="row-info">
                  <div className="row-name">{w.name}</div>
                  <div className="row-sub">
                    <StatusPill state={state} />
                    {state !== 'off' && <span className={`row-timer${over ? ' danger' : ''}`}>{timer(t.elapsed)}</span>}
                  </div>
                  <div className="row-meta">
                    Днес: <b>{hm(t.w)}</b> работа · {hm(t.b)} почивка · {t.n}
                    {settings.maxBreaks === null ? '' : `/${settings.maxBreaks}`} почивки
                    {state === 'off' && st?.lastOut && dayKey(st.lastOut) === today ? ' · приключи днес' : ''}
                  </div>
                </div>
                {state !== 'off' && (
                  <button
                    className={`btn btn-sm btn-red-o${confirm === w.id ? ' confirm' : ''}`}
                    onClick={async () => {
                      if (confirm !== w.id) return setConfirm(w.id);
                      setConfirm(null);
                      await call({ action: 'forceOut', id: w.id }).catch(() => {});
                      ok(`${w.name} е приключен`);
                    }}
                  >
                    {confirm === w.id ? 'Сигурен?' : 'Приключи'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Workers({ data, call, ok }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await call({ action: 'addWorker', name });
      ok('Добавен');
      setName('');
    } catch {}
    setBusy(false);
  }

  return (
    <section>
      <form className="card add" onSubmit={add}>
        <input placeholder="Име на работник" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <button className="btn btn-green" disabled={busy || !name.trim()}>Добави</button>
      </form>
      <div className="rows">
        {data.workers.map((w, i) => (
          <div key={w.id} className="row card stagger" style={{ '--i': i }}>
            <div className="row-main static">
              <Avatar id={w.id} name={w.name} size={38} />
              <NameEdit w={w} call={call} ok={ok} />
              <div className="row-btns">
                <button className="icon-btn" disabled={i === 0} onClick={() => call({ action: 'moveWorker', id: w.id, dir: 'up' }).catch(() => {})} aria-label="Нагоре">↑</button>
                <button className="icon-btn" disabled={i === data.workers.length - 1} onClick={() => call({ action: 'moveWorker', id: w.id, dir: 'down' }).catch(() => {})} aria-label="Надолу">↓</button>
                <button
                  className={`btn btn-sm btn-red-o${del === w.id ? ' confirm' : ''}`}
                  onClick={async () => {
                    if (del !== w.id) return setDel(w.id);
                    setDel(null);
                    await call({ action: 'removeWorker', id: w.id }).catch(() => {});
                    ok('Изтрит');
                  }}
                >
                  {del === w.id ? 'Сигурен?' : 'Изтрий'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NameEdit({ w, call, ok }) {
  const [v, setV] = useState(w.name);
  useEffect(() => setV(w.name), [w.name]);
  const save = async () => {
    if (!v.trim() || v.trim() === w.name) return setV(w.name);
    try {
      await call({ action: 'renameWorker', id: w.id, name: v });
      ok('Името е обновено');
    } catch {
      setV(w.name);
    }
  };
  return (
    <input
      className="name-edit"
      value={v}
      maxLength={40}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function Cal({ data, now, call, ok }) {
  const { workers, status, logs } = data;
  const [sel, setSel] = useState(workers[0]?.id || null);
  const w = workers.find((x) => x.id === sel) || workers[0];
  const ym = dayKey(now).slice(0, 7);

  const onSetDay = useCallback(
    async (id, day, minutes) => {
      await call({ action: 'setDay', id, day, minutes });
      ok('Денят е коригиран');
    },
    [call, ok]
  );

  if (!w) return <div className="empty card">Няма работници.</div>;
  const t = liveTotals(status[w.id], logs[w.id], now);

  return (
    <section>
      <div className="chips">
        {workers.map((x) => (
          <button key={x.id} className={`chip${x.id === w.id ? ' on' : ''}`} onClick={() => setSel(x.id)}>
            {x.name}
          </button>
        ))}
      </div>
      <div className="card pad">
        <Calendar
          key={w.id}
          workerId={w.id}
          log={logs[w.id]}
          liveTodaySec={Math.floor(t.w / 60) * 60}
          editable
          onSetDay={onSetDay}
        />
      </div>
      <div className="card pad">
        <h3>Този месец – всички</h3>
        <table className="tbl">
          <thead>
            <tr><th>Име</th><th>Часове</th><th>Дни</th><th>Почивки</th></tr>
          </thead>
          <tbody>
            {workers.map((x) => {
              let sec = 0, days = 0, br = 0;
              const today = dayKey(now);
              for (const [d, s] of Object.entries(logs[x.id] || {})) {
                if (!d.startsWith(ym)) continue;
                let ws = s?.w || 0;
                if (d === today) ws = liveTotals(status[x.id], logs[x.id], now).w;
                sec += ws;
                if (ws > 60) days++;
                br += s?.n || 0;
              }
              return (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td><b>{hm(sec)}</b></td>
                  <td>{days}</td>
                  <td>{br}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Settings({ data, call, ok }) {
  const s = data.settings;
  const [f, setF] = useState({
    unlimited: s.maxBreaks === null,
    maxBreaks: s.maxBreaks ?? 2,
    cooldownMin: s.cooldownMin,
    breakMaxMin: s.breakMaxMin,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await call({
        action: 'settings',
        settings: {
          maxBreaks: f.unlimited ? null : f.maxBreaks,
          cooldownMin: f.cooldownMin,
          breakMaxMin: f.breakMaxMin,
        },
      });
      ok('Настройките са запазени');
    } catch {}
    setBusy(false);
  }

  return (
    <form className="card pad settings" onSubmit={save}>
      <h3>Почивки</h3>
      <label className="field">
        <span>Максимум почивки на ден</span>
        <div className="field-row">
          <input type="number" min="0" max="50" disabled={f.unlimited} value={f.maxBreaks} onChange={set('maxBreaks')} />
          <label className="check">
            <input type="checkbox" checked={f.unlimited} onChange={set('unlimited')} /> без лимит
          </label>
        </div>
      </label>
      <label className="field">
        <span>Cooldown между почивки (минути)</span>
        <input type="number" min="0" max="1440" value={f.cooldownMin} onChange={set('cooldownMin')} />
        <small className="muted">Колко време след края на почивка трябва да мине, преди следващата. 0 = без cooldown.</small>
      </label>
      <label className="field">
        <span>Максимална дължина на почивка (минути)</span>
        <input type="number" min="0" max="1440" value={f.breakMaxMin} onChange={set('breakMaxMin')} />
        <small className="muted">Ако се превиши, таймерът светва в червено. 0 = без лимит.</small>
      </label>
      <button className="btn btn-green btn-lg" disabled={busy}>{busy ? '…' : 'Запази'}</button>
    </form>
  );
}
