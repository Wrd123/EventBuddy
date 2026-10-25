import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { Capacitor } from '@capacitor/core';
import { MapPin, MessageCircle, Wallet, Ticket, Github } from 'lucide-react';
import { Wordmark } from '../common/Header';

const REPO_URL = 'https://github.com/Wrd123/EventBuddy';

const FEATURES = [
  { icon: MapPin, text: 'See where friends are during an event, even with their phone locked' },
  { icon: MessageCircle, text: 'A group chat for every event, with unread counts' },
  { icon: Wallet, text: 'Split costs and settle up with Venmo, Cash App, PayPal or Zelle' },
  { icon: Ticket, text: 'Find concerts and games nearby, then plan them with friends' }
];

// A QR code for the current address, drawn as SVG on white so phone
// cameras read it reliably
const QrCode = ({ text }) => {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size: count, path: d };
  }, [text]);

  return (
    <svg
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      className="w-28 h-28 rounded-xl bg-white shrink-0"
      role="img"
      aria-label={`QR code to open ${text} on your phone`}
    >
      <path d={path} fill="#0c0a1f" />
    </svg>
  );
};

// EventBuddy is a phone app. On a laptop-sized screen it's shown in a phone
// frame, next to a short note about what it is, so it reads as intended
// rather than as a narrow page. Phones (and the native app) get the app alone.
const ShowcaseFrame = ({ children }) => {
  if (Capacitor.isNativePlatform()) return children;

  return (
    <div className="h-full lg:flex lg:items-center lg:justify-center lg:gap-16 xl:gap-24 lg:px-10 lg:bg-[radial-gradient(circle_at_30%_35%,rgba(139,92,246,0.16),transparent_55%)]">
      <aside className="hidden lg:flex flex-col max-w-sm" aria-label="About EventBuddy">
        <p className="text-5xl font-extrabold tracking-tight mb-4"><Wordmark /></p>
        <p className="text-xl text-fg/90 leading-snug mb-8">
          Plan trips, festivals and nights out with your friends, in one place.
        </p>

        <ul className="space-y-4 mb-10">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start text-fg/80">
              <span className="w-9 h-9 rounded-xl bg-violet/15 text-violet-soft flex items-center justify-center shrink-0 mr-3">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="pt-1.5">{text}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4 mb-8">
          <QrCode text={window.location.origin} />
          <p className="text-sm text-muted">
            It's built for phones. Scan to open it on yours, or try it right here.
          </p>
        </div>

        <p className="text-sm text-faint mb-3">React, Express, MongoDB and Capacitor (iOS)</p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center self-start rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg hover:border-violet/60"
        >
          <Github size={16} className="mr-2" aria-hidden="true" />
          Code and write-up on GitHub
        </a>
      </aside>

      <div className="h-full relative lg:h-[min(860px,calc(100dvh-48px))] lg:w-[400px] lg:shrink-0 lg:rounded-[52px] lg:border-[10px] lg:border-[#1b1838] lg:overflow-hidden lg:shadow-[0_0_80px_rgba(139,92,246,0.22)]">
        {children}
      </div>
    </div>
  );
};

export default ShowcaseFrame;
