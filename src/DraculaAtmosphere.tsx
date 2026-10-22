// Ambient Dracula scenery: fog, cobwebs, drifting bats, a blood moon and
// a full blood-drip system. Decorative only; hidden in the light theme and
// never interactive.

function Cobweb() {
  return (
    <svg className="cobweb-art" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth=".5" aria-hidden="true">
      <circle cx="0" cy="0" r="24" />
      <circle cx="0" cy="0" r="48" />
      <circle cx="0" cy="0" r="72" />
      <circle cx="0" cy="0" r="96" />
      <path d="M100 0 0 0M0 100 0 0M0 0 100 100M0 0 84 20M0 0 20 84M0 0 96 46M0 0 46 96M0 0 66 66" />
    </svg>
  );
}

function BackBat({ y, scale, flip }: { y: string; scale: number; flip: boolean }) {
  return (
    <div className="dracula-backbat" style={{ top: y, transform: `scale(${scale}) scaleX(${flip ? -1 : 1})` }}>
      <svg className="backbat-art" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M3 10c4 1 6 0 9-2l1 5 3-2 3 2 1-5c3 2 5 3 9 2-1 5-3 8-6 11-1-3-3-3-5-2l-2 5-2-5c-2-1-4-1-5 2-3-3-5-6-6-11Z" />
      </svg>
    </div>
  );
}

interface Drip {
  left: number;
  width: number;
  len: number;
  delay: number;
  dur: number;
  drop?: boolean;
}

// Thick, fast, weeping drips that hang from the topbar.
const DRIPS: Drip[] = [
  { left: 2, width: 4, len: 38, delay: 0.1, dur: 3.1, drop: true },
  { left: 8, width: 2, len: 22, delay: 0.55, dur: 4.2 },
  { left: 14, width: 5, len: 26, delay: 0.2, dur: 3.4, drop: true },
  { left: 21, width: 2, len: 18, delay: 1.0, dur: 4.8 },
  { left: 27, width: 3, len: 32, delay: 0.35, dur: 3.7, drop: true },
  { left: 34, width: 6, len: 40, delay: 0.05, dur: 3.2, drop: true },
  { left: 41, width: 2, len: 24, delay: 0.8, dur: 4.5 },
  { left: 48, width: 4, len: 36, delay: 0.45, dur: 3.9, drop: true },
  { left: 55, width: 3, len: 28, delay: 1.2, dur: 4.9 },
  { left: 62, width: 6, len: 40, delay: 0.15, dur: 3.3, drop: true },
  { left: 69, width: 2, len: 20, delay: 0.7, dur: 4.3 },
  { left: 76, width: 5, len: 34, delay: 0.3, dur: 3.6, drop: true },
  { left: 83, width: 3, len: 30, delay: 0.95, dur: 4.6, drop: true },
  { left: 90, width: 4, len: 38, delay: 0.25, dur: 3.5, drop: true },
  { left: 96, width: 2, len: 20, delay: 1.1, dur: 4.7 },
];

// Thin, long capillaries that ooze down slowly behind the heavy drips.
const CAPILLARIES: Drip[] = [
  { left: 5, width: 1, len: 34, delay: 0.4, dur: 9 },
  { left: 11, width: 1, len: 40, delay: 1.6, dur: 11 },
  { left: 18, width: 2, len: 36, delay: 0.9, dur: 8.5 },
  { left: 30, width: 1, len: 40, delay: 2.4, dur: 12 },
  { left: 38, width: 1, len: 30, delay: 1.2, dur: 9.5 },
  { left: 52, width: 2, len: 38, delay: 0.2, dur: 10.5 },
  { left: 59, width: 1, len: 32, delay: 2.9, dur: 11.5 },
  { left: 66, width: 1, len: 40, delay: 1.8, dur: 12.5 },
  { left: 73, width: 2, len: 28, delay: 0.6, dur: 9.2 },
  { left: 80, width: 1, len: 36, delay: 3.3, dur: 10.8 },
  { left: 87, width: 1, len: 30, delay: 2.1, dur: 11.2 },
  { left: 93, width: 2, len: 40, delay: 1.4, dur: 12.2 },
];

function dripStyle(drip: Drip): React.CSSProperties {
  return {
    left: `${drip.left}%`,
    width: `${drip.width}px`,
    animationDelay: `${drip.delay}s`,
    animationDuration: `${drip.dur}s`,
    ['--len' as string]: `${drip.len}px`,
  } as React.CSSProperties;
}

export function DraculaAtmosphere() {
  return (
    <>
      <div className="dracula-atmosphere" aria-hidden="true">
        <div className="dracula-fog" />
        <div className="dracula-vignette" />
        <div className="dracula-moon" />
        <div className="dracula-cobweb tl"><Cobweb /></div>
        <div className="dracula-cobweb tr"><Cobweb /></div>
        <div className="dracula-cobweb bl"><Cobweb /></div>
        <div className="dracula-cobweb br"><Cobweb /></div>
        <div className="dracula-backbats">
          <BackBat y="14%" scale={1.6} flip={false} />
          <BackBat y="62%" scale={2.1} flip />
          <BackBat y="82%" scale={1.2} flip={false} />
          <BackBat y="6%" scale={1.8} flip />
        </div>
      </div>
      <div className="dracula-drips" aria-hidden="true">
        <div className="dracula-ooze" />
        {CAPILLARIES.map((drip, index) => (
          <span key={`cap-${index}`} className="dracula-drip capillary" style={dripStyle(drip)} />
        ))}
        {DRIPS.map((drip, index) => (
          <span key={`drip-${index}`} className="dracula-drip" style={dripStyle(drip)} />
        ))}
        {DRIPS.map((drip, index) => drip.drop ? (
          <span
            key={`drop-${index}`}
            className="dracula-drop"
            style={{
              left: `${drip.left}%`,
              width: `${Math.max(4, drip.width + 1)}px`,
              marginLeft: `-${Math.max(4, drip.width + 1) / 2}px`,
              animationDelay: `${(drip.delay + drip.dur + (index % 3) * 0.6).toFixed(2)}s`,
              animationDuration: `${(2.4 + (index % 4) * 0.45).toFixed(2)}s`,
              ['--len' as string]: `${drip.len}px`,
            } as React.CSSProperties}
          />
        ) : null)}
      </div>
    </>
  );
}
