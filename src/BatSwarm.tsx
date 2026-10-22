import { useEffect, useMemo } from 'react';

interface BatConfig {
  id: number;
  x: [number, number, number, number];
  y: [number, number, number, number];
  r: [number, number, number, number];
  scale: number;
  scaleMid: number;
  duration: number;
  delay: number;
  flap: number;
  wobble: number;
  opacity: number;
  glow: number;
}

// Deterministic PRNG so a swarm is varied but reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeBats(): BatConfig[] {
  const rand = mulberry32(0xd0ac1a);
  // Three depth layers: distant swarm, mid fliers, and huge foreground wings.
  const layers = [
    { count: 20, sMin: 0.32, sMax: 0.85, dMin: 2.6, dMax: 4.1, oMin: 0.26, oMax: 0.6, glow: 0.18 },
    { count: 20, sMin: 0.9, sMax: 1.95, dMin: 1.6, dMax: 2.7, oMin: 0.6, oMax: 0.92, glow: 0.5 },
    { count: 16, sMin: 2.1, sMax: 3.7, dMin: 1.0, dMax: 1.8, oMin: 0.85, oMax: 1, glow: 0.9 },
  ];
  const bats: BatConfig[] = [];
  let id = 0;
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i += 1) {
      id += 1;
      const scale = layer.sMin + rand() * (layer.sMax - layer.sMin);
      const y0 = -10 + rand() * 118;
      const drift = (rand() - 0.5) * 52;
      const y: [number, number, number, number] = [
        y0,
        clamp(y0 + drift * 0.45 + (rand() - 0.5) * 20, -14, 114),
        clamp(y0 + drift - rand() * 26, -16, 114),
        clamp(y0 + drift * 0.3, -14, 114),
      ];
      const x: [number, number, number, number] = [
        -18 - rand() * 18,
        16 + rand() * 28,
        56 + rand() * 32,
        116 + rand() * 20,
      ];
      const base = -18 - rand() * 36;
      const r: [number, number, number, number] = [
        base + (rand() - 0.5) * 16,
        base + (rand() - 0.5) * 30,
        base + (rand() - 0.5) * 34,
        base + (rand() - 0.5) * 22,
      ];
      bats.push({
        id,
        x,
        y,
        r,
        scale,
        scaleMid: scale * (0.8 + rand() * 0.65),
        duration: layer.dMin + rand() * (layer.dMax - layer.dMin),
        delay: rand() * 1.2,
        flap: 0.06 + rand() * 0.07,
        wobble: 0.14 + rand() * 0.22,
        opacity: layer.oMin + rand() * (layer.oMax - layer.oMin),
        glow: layer.glow + rand() * 0.22,
      });
    }
  }
  return bats;
}

function BatGlyph() {
  return (
    <svg
      className="bat-silhouette"
      viewBox="0 0 32 32"
      fill="#0b0712"
      stroke="#e9a9c8"
      strokeWidth=".8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10c4 1 6 0 9-2l1 5 3-2 3 2 1-5c3 2 5 3 9 2-1 5-3 8-6 11-1-3-3-3-5-2l-2 5-2-5c-2-1-4-1-5 2-3-3-5-6-6-11Z" />
      <path d="m12.5 15 1.6 .8m4 0 1.6-.8" stroke="#ff2d55" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function BatSwarm({ onComplete }: { onComplete: () => void }) {
  const bats = useMemo(makeBats, []);

  useEffect(() => {
    const timer = window.setTimeout(onComplete, 5600);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="bat-swarm-overlay" aria-hidden="true">
      <div className="bat-swarm-moon" />
      <div className="bat-swarm-streaks" />
      <div className="bat-swarm-vignette" />
      <div className="bat-swarm-flash" />
      {bats.map(bat => {
        const style: Record<string, string | number> = {
          '--x0': `${bat.x[0]}vw`,
          '--y0': `${bat.y[0]}vh`,
          '--x1': `${bat.x[1]}vw`,
          '--y1': `${bat.y[1]}vh`,
          '--x2': `${bat.x[2]}vw`,
          '--y2': `${bat.y[2]}vh`,
          '--x3': `${bat.x[3]}vw`,
          '--y3': `${bat.y[3]}vh`,
          '--r0': `${bat.r[0]}deg`,
          '--r1': `${bat.r[1]}deg`,
          '--r2': `${bat.r[2]}deg`,
          '--r3': `${bat.r[3]}deg`,
          '--scale': bat.scale,
          '--scale-mid': bat.scaleMid,
          '--duration': `${bat.duration}s`,
          '--delay': `${bat.delay}s`,
          '--flap-speed': `${bat.flap}s`,
          '--wobble-speed': `${bat.wobble}s`,
          '--opacity': bat.opacity,
          '--glow': `rgba(255, 74, 116, ${bat.glow})`,
        };

        return (
          <div key={bat.id} className="bat-flight" style={style as React.CSSProperties}>
            <div className="bat-wobble">
              <div className="bat-wings">
                <BatGlyph />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
