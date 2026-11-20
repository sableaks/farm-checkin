'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useFarm, useNow, useStored, buzz } from '@/lib/client';
import { Avatar, Header, Splash } from '@/components/ui';
import MePanel from '@/components/MePanel';
import WorkerRow from '@/components/WorkerRow';

export default function Home() {
  const { data, online, apply } = useFarm();
  const now = useNow();
  const [meId, setMeId] = useStored('farm-me', null);
  const [open, setOpen] = useState(null);
  const [picking, setPicking] = useState(false);

  if (!data) return <Splash />;

  const { workers, status, logs, settings } = data;
  const me = workers.find((w) => w.id === meId);
  const counts = { working: 0, break: 0, off: 0 };
  workers.forEach((w) => (counts[status[w.id]?.state || 'off'] += 1));

  return (
    <main className="wrap">
      <Header online={online} now={now} />

      {me && !picking ? (
        <MePanel
          key={me.id}
          worker={me}
          status={status[me.id]}
          log={logs[me.id]}
          settings={settings}
          now={now}
          apply={apply}
          onChange={() => setPicking(true)}
        />
      ) : (
        <section className="card pick fade-in">
          <h2>Кой си ти?</h2>
          <p className="muted">Избери името си, за да се чекнеш на работа.</p>
          {workers.length === 0 ? (
            <div className="empty">Още няма добавени работници. Админът трябва да ги добави.</div>
          ) : (
            <div className="pick-grid">
              {workers.map((w) => (
                <button
                  key={w.id}
                  className={`pick-btn${w.id === meId ? ' sel' : ''}`}
                  onClick={() => {
                    buzz();
                    setMeId(w.id);
                    setPicking(false);
                  }}
                >
                  <Avatar id={w.id} name={w.name} size={38} />
                  <span>{w.name}</span>
                </button>
              ))}
            </div>
          )}
          {me && picking && (
            <button className="link mt" onClick={() => setPicking(false)}>Отказ</button>
          )}
        </section>
      )}

      <section className="team">
        <div className="team-h">
          <h2>Екипът</h2>
          <div className="counts">
            <span className="c c-working">{counts.working} работят</span>
            <span className="c c-break">{counts.break} почивка</span>
          </div>
        </div>
        <div className="rows">
          {workers.map((w, i) => (
            <div key={w.id} className="stagger" style={{ '--i': i }}>
              <WorkerRow
                worker={w}
                status={status[w.id]}
                log={logs[w.id]}
                settings={settings}
                now={now}
                isMe={w.id === meId}
                open={open === w.id}
                onToggle={() => setOpen(open === w.id ? null : w.id)}
              />
            </div>
          ))}
        </div>
      </section>

      <footer className="foot">
        <Link href="/admin">Админ панел</Link>
        {!data.hasDb && <div className="warn">⚠ Няма свързана база данни – данните не се пазят.</div>}
      </footer>
    </main>
  );
}
