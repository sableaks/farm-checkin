'use client';
import { memo } from 'react';
import { useMinute } from '@/lib/client';
import { clock, hueFor, initials } from '@/lib/time';

export function Avatar({ id, name, size = 44 }) {
  const h = hueFor(id);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${h} 55% 92%)`,
        color: `hsl(${h} 55% 30%)`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

const LABEL = { working: 'Работи', break: 'Почивка', off: 'Не е на работа' };

export function StatusPill({ state = 'off' }) {
  return (
    <span className={`pill pill-${state}`}>
      <span className="dot" />
      {LABEL[state] || LABEL.off}
    </span>
  );
}

function Clock() {
  return clock(useMinute());
}

export const Header = memo(function Header({ online, right }) {
  return (
    <header className="top">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
          <path d="M16 29V12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M16 13c0-5 3-8 8-9 0 5-3 8-8 9zM16 13c0-5-3-8-8-9 0 5 3 8 8 9z" fill="currentColor" />
          <path d="M16 21c0-4 3-6 7-7 0 4-3 6-7 7zM16 21c0-4-3-6-7-7 0 4 3 6 7 7z" fill="currentColor" opacity=".7" />
        </svg>
        <div>
          <div className="brand-t">Ферма · Смени</div>
          <div className="brand-s">
            <span className={`live ${online ? 'on' : 'off'}`} />
            {online ? 'На живо' : 'Няма връзка…'} · <Clock />
          </div>
        </div>
      </div>
      {right}
    </header>
  );
});

export function Splash() {
  return (
    <div className="splash">
      <div className="spinner" />
    </div>
  );
}

export function evLabel(t) {
  return (
    {
      in: 'Започна работа',
      out: 'Приключи',
      aout: 'Приключен от админ',
      bs: 'Почивка',
      be: 'Обратно на работа',
    }[t] || t
  );
}
