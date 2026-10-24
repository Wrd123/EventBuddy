import React, { useId } from 'react';

// Illustrated event covers, drawn in SVG instead of photos: a sunset Ferris
// wheel for festivals, stage beams for concerts, layered mountains for
// outdoor trips and a skyline for travel. The seed (usually the event id)
// picks the palette and nudges the shapes, so two events of the same type
// still look different. Purely decorative, so it's hidden from screen readers.

// Small deterministic random generator, so a seed always draws the same art
const seededRandom = (seed = '') => {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

// [top, middle, horizon] sky stops per type, several per type for variety
const SKIES = {
  'music-festival': [
    ['#2b1660', '#b8367e', '#f7a046'],
    ['#0f1e4a', '#3b5bb5', '#f2a6c9'],
    ['#2a0f3d', '#d9466f', '#ffcf6b'],
    ['#10303f', '#1f8a8a', '#f7c873']
  ],
  concert: [['#0e0a26', '#2a1663', '#5b2a9c'], ['#120b2e', '#381874', '#8a2b8f'], ['#0d0c2b', '#22207a', '#4a3bb5']],
  outdoor: [['#1d1548', '#7a3a8f', '#f08a6b'], ['#18164a', '#5b3a9c', '#f6a35c'], ['#1a1240', '#8e3b7c', '#ffb36b']],
  sports: [['#06122e', '#132a6b', '#2f56b0'], ['#0b0f2e', '#1d2a7a', '#4b3fb5'], ['#071a2a', '#0f3b5c', '#2a7a9c']],
  arts: [['#1a0a1e', '#4a1240', '#8a2050'], ['#160a2a', '#3d1660', '#7a2a7a'], ['#1c0d14', '#521a2e', '#9a3a3a']],
  'group-travel': [['#121a4a', '#3c3d9e', '#e78bb0'], ['#16124a', '#5040a8', '#f3a07a'], ['#0f1b46', '#2f5aa8', '#9fb7ff']]
};

const Sky = ({ id, stops }) => (
  <>
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={stops[0]} />
        <stop offset="0.6" stopColor={stops[1]} />
        <stop offset="1" stopColor={stops[2]} />
      </linearGradient>
      <radialGradient id={`${id}-sun`}>
        <stop offset="0" stopColor="#fff3c4" />
        <stop offset="0.35" stopColor="#ffd27a" stopOpacity="0.9" />
        <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="400" height="240" fill={`url(#${id}-sky)`} />
  </>
);

const Sun = ({ id, x, y, r = 60 }) => <circle cx={x} cy={y} r={r} fill={`url(#${id}-sun)`} />;

// A Ferris wheel on one side and palms on the other, or a lit stage
const Festival = ({ id, rand }) => {
  const onRight = rand() > 0.5;
  const withWheel = rand() > 0.25;
  const r = 46 + rand() * 26;
  const wheelX = onRight ? 250 + rand() * 80 : 70 + rand() * 80;
  const wheelY = 238 - r - 50;
  const spokes = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);
  // Palms keep to the side away from the wheel
  const palmBase = onRight ? 20 : 230;
  const palms = Array.from({ length: 2 + Math.floor(rand() * 2) }, (_, i) => palmBase + i * 55 + rand() * 25);
  return (
    <>
      <Sun id={id} x={withWheel ? wheelX : 200} y={175} r={95} />
      {withWheel ? (
        <>
          <g stroke="#2a0f3d" fill="none" strokeWidth="2.5" opacity="0.9">
            <circle cx={wheelX} cy={wheelY} r={r} />
            <circle cx={wheelX} cy={wheelY} r={7} fill="#2a0f3d" />
            {spokes.map((a) => (
              <line key={a} x1={wheelX} y1={wheelY} x2={wheelX + Math.cos(a) * r} y2={wheelY + Math.sin(a) * r} />
            ))}
            <path d={`M${wheelX - r / 2} 240 L${wheelX} ${wheelY} L${wheelX + r / 2} 240`} strokeWidth="4" />
          </g>
          {spokes.map((a) => (
            <circle key={a} cx={wheelX + Math.cos(a) * r} cy={wheelY + Math.sin(a) * r} r={4} fill="#ffd27a" opacity="0.85" />
          ))}
        </>
      ) : (
        <g>
          <path d="M120 180 L200 120 L280 180 Z" fill="#2a0f3d" />
          <rect x="110" y="178" width="180" height="20" fill="#2a0f3d" />
          {[140, 170, 200, 230, 260].map((x) => <circle key={x} cx={x} cy={150 + Math.abs(200 - x) / 3} r={3} fill="#ffd27a" />)}
        </g>
      )}
      {palms.map((x, i) => (
        <g key={i} fill="#1c0b2c">
          <path d={`M${x} 240 Q${x + 6} 180 ${x + 2} ${130 + i * 8}`} stroke="#1c0b2c" strokeWidth="5" fill="none" />
          {[-60, -25, 15, 50, 85].map((deg) => (
            <ellipse key={deg} cx={x + 2} cy={130 + i * 8} rx="30" ry="6" transform={`rotate(${deg} ${x + 2} ${130 + i * 8}) translate(22 0)`} />
          ))}
        </g>
      ))}
      <path d="M0 240 Q20 222 40 232 T80 228 T120 232 T160 226 T200 232 T240 226 T280 232 T320 228 T360 232 T400 226 V240 Z" fill="#160822" />
    </>
  );
};

const Concert = ({ id, rand }) => {
  const beams = [70, 160, 250, 340].map((x) => x + (rand() - 0.5) * 30);
  const colors = ['#c084fc', '#f472b6', '#60a5fa', '#a78bfa'];
  return (
    <>
      <defs>
        <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.65" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {beams.map((x, i) => (
        <polygon
          key={i}
          points={`${x - 6},0 ${x + 6},0 ${x + 70 - i * 35},200 ${x - 70 + i * 10},200`}
          fill={`url(#${id}-beam)`}
          opacity="0.5"
          style={{ mixBlendMode: 'screen' }}
        />
      ))}
      {beams.map((x, i) => <circle key={i} cx={x} cy={4} r={5} fill={colors[i]} />)}
      <rect x="40" y="150" width="320" height="10" rx="3" fill="#2a1450" />
      {Array.from({ length: 22 }, (_, i) => {
        const x = i * 19 + rand() * 6;
        const y = 205 + rand() * 12;
        return <circle key={i} cx={x} cy={y} r={11 + rand() * 4} fill="#0b0618" />;
      })}
      {[60, 150, 270, 330].map((x, i) => (
        <path key={i} d={`M${x} 210 L${x + 6} ${168 - rand() * 14}`} stroke="#0b0618" strokeWidth="5" strokeLinecap="round" />
      ))}
      <rect y="214" width="400" height="26" fill="#0b0618" />
    </>
  );
};

const Outdoor = ({ id, rand }) => {
  const sunX = 120 + rand() * 180;
  const ridge = (base, amp, seedShift) => {
    const pts = [];
    for (let x = 0; x <= 400; x += 40) {
      pts.push(`${x},${base - amp * Math.abs(Math.sin((x + seedShift) / 70)) - rand() * 12}`);
    }
    return `M0,240 L${pts.join(' L')} L400,240 Z`;
  };
  const shift = rand() * 200;
  return (
    <>
      <Sun id={id} x={sunX} y={140} r={115} />
      <path d={ridge(150, 50, shift)} fill="#8a5bc0" opacity="0.7" />
      <path d={ridge(175, 45, shift + 90)} fill="#553291" />
      <path d={ridge(205, 35, shift + 180)} fill="#2c1856" />
      {Array.from({ length: 9 }, (_, i) => {
        const x = i * 48 + rand() * 20;
        const h = 30 + rand() * 25;
        return <path key={i} d={`M${x} 240 L${x + 10} ${240 - h} L${x + 20} 240 Z`} fill="#120a24" />;
      })}
    </>
  );
};

const Travel = ({ id, rand }) => {
  const buildings = [];
  for (let x = 0; x < 400; ) {
    const w = 22 + rand() * 26;
    const h = 50 + rand() * 90;
    buildings.push({ x, w, h });
    x += w + 3;
  }
  return (
    <>
      <Sun id={id} x={300 - rand() * 120} y={150} r={70} />
      <path d="M20 110 Q200 10 380 70" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="6 8" fill="none" />
      <path d="M372 66 l12 2 -10 8 z" fill="#fff" />
      {buildings.map(({ x, w, h }) => (
        <g key={x}>
          <rect x={x} y={240 - h} width={w} height={h} fill="#130d33" />
          {Array.from({ length: Math.floor(h / 18) }, (_, row) => (
            <rect key={row} x={x + 5} y={250 - h + row * 18} width={w - 10} height="4" fill="#ffd27a" opacity={rand() > 0.5 ? 0.55 : 0.12} />
          ))}
        </g>
      ))}
    </>
  );
};

// A night stadium: floodlights over a green field and the stands
const Sports = ({ id, rand }) => {
  const towers = [60 + rand() * 30, 310 + rand() * 30];
  return (
    <>
      <defs>
        <radialGradient id={`${id}-flood`}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#bfd7ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {towers.map((x) => (
        <g key={x}>
          <circle cx={x} cy={46} r={70} fill={`url(#${id}-flood)`} opacity="0.45" />
          <rect x={x - 3} y={50} width="6" height="140" fill="#0a0f24" />
          <rect x={x - 18} y={38} width="36" height="14" rx="3" fill="#e8f0ff" />
        </g>
      ))}
      <path d="M0 170 Q200 120 400 170 V240 H0 Z" fill="#0d1a3c" />
      {Array.from({ length: 30 }, (_, i) => (
        <circle key={i} cx={i * 14 + rand() * 6} cy={160 - Math.sin((i / 30) * Math.PI) * 28 + rand() * 6} r="2.2" fill="#ffd27a" opacity={rand() > 0.5 ? 0.7 : 0.25} />
      ))}
      <ellipse cx="200" cy="240" rx="230" ry="55" fill="#1f7a4a" />
      <ellipse cx="200" cy="240" rx="230" ry="55" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
      <line x1="200" y1="185" x2="200" y2="240" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
      <ellipse cx="200" cy="225" rx="34" ry="10" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
    </>
  );
};

// A theater stage: curtains framing a spotlight
const Arts = ({ id, rand }) => {
  const spotX = 150 + rand() * 100;
  const folds = (side) => Array.from({ length: 5 }, (_, i) => {
    const x = side === 'left' ? i * 22 : 400 - i * 22 - 22;
    return <rect key={`${side}${i}`} x={x} y="0" width="22" height="240" fill={i % 2 ? '#7a1834' : '#962040'} />;
  });
  return (
    <>
      <defs>
        <linearGradient id={`${id}-spot`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <polygon points={`${spotX - 8},0 ${spotX + 8},0 ${spotX + 70},200 ${spotX - 70},200`} fill={`url(#${id}-spot)`} />
      <ellipse cx={spotX} cy="200" rx="75" ry="14" fill="#fff3c4" opacity="0.35" />
      <rect x="0" y="200" width="400" height="40" fill="#2a0f1e" />
      <rect x="0" y="198" width="400" height="4" fill="#d9a441" opacity="0.8" />
      {folds('left')}
      {folds('right')}
      <path d="M0 0 H400 V26 Q300 46 200 30 Q100 46 0 26 Z" fill="#b02a4a" />
    </>
  );
};

const SCENES = {
  'music-festival': Festival,
  concert: Concert,
  outdoor: Outdoor,
  'group-travel': Travel,
  sports: Sports,
  arts: Arts
};

const EventArt = ({ type, seed, className = '' }) => {
  // useId gives ":r1:"-style ids; colons break url(#...) references
  const id = `art${useId().replace(/:/g, '')}`;
  const kind = SCENES[type] ? type : 'music-festival';
  const rand = seededRandom(`${seed}-${kind}`);
  const skies = SKIES[kind];
  const Scene = SCENES[kind];

  return (
    <svg
      className={className}
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <Sky id={id} stops={skies[Math.floor(rand() * skies.length)]} />
      <Scene id={id} rand={rand} />
    </svg>
  );
};

export default EventArt;
