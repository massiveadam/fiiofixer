import { useEffect } from 'react';

interface BatConfig {
  id: number;
  x0: number;
  y0: number;
  xmid: number;
  ymid: number;
  x1: number;
  y1: number;
  rot0: number;
  rotmid: number;
  rot1: number;
  scale: number;
  duration: number;
  delay: number;
  flapSpeed: number;
  wobbleSpeed: number;
  opacity: number;
  glow: string;
}

const BATS: BatConfig[] = [
  { id: 1, x0: -10, y0: 80, xmid: 45, ymid: 30, x1: 110, y1: -10, rot0: -35, rotmid: -38, rot1: -40, scale: 1.1, duration: 1.5, delay: 0.05, flapSpeed: 0.13, wobbleSpeed: 0.28, opacity: 0.95, glow: 'rgba(255, 113, 139, 0.45)' },
  { id: 2, x0: -15, y0: 95, xmid: 40, ymid: 45, x1: 115, y1: -5, rot0: -30, rotmid: -32, rot1: -34, scale: 1.8, duration: 1.8, delay: 0.18, flapSpeed: 0.16, wobbleSpeed: 0.32, opacity: 1, glow: 'rgba(255, 113, 139, 0.65)' },
  { id: 3, x0: -8, y0: 65, xmid: 50, ymid: 20, x1: 112, y1: -15, rot0: -40, rotmid: -42, rot1: -45, scale: 0.65, duration: 1.4, delay: 0.0, flapSpeed: 0.11, wobbleSpeed: 0.24, opacity: 0.75, glow: 'rgba(255, 113, 139, 0.3)' },
  { id: 4, x0: 5, y0: 105, xmid: 60, ymid: 55, x1: 118, y1: 10, rot0: -26, rotmid: -28, rot1: -30, scale: 1.2, duration: 1.9, delay: 0.22, flapSpeed: 0.14, wobbleSpeed: 0.3, opacity: 0.9, glow: 'rgba(255, 113, 139, 0.45)' },
  { id: 5, x0: -12, y0: 50, xmid: 40, ymid: 10, x1: 108, y1: -20, rot0: -33, rotmid: -35, rot1: -37, scale: 0.85, duration: 1.6, delay: 0.12, flapSpeed: 0.12, wobbleSpeed: 0.26, opacity: 0.85, glow: 'rgba(255, 113, 139, 0.35)' },
  { id: 6, x0: -5, y0: 90, xmid: 35, ymid: 40, x1: 110, y1: -12, rot0: -34, rotmid: -36, rot1: -38, scale: 1.3, duration: 1.7, delay: 0.28, flapSpeed: 0.15, wobbleSpeed: 0.29, opacity: 0.95, glow: 'rgba(255, 113, 139, 0.5)' },
  { id: 7, x0: 10, y0: 110, xmid: 55, ymid: 35, x1: 120, y1: -8, rot0: -32, rotmid: -34, rot1: -36, scale: 1.7, duration: 1.75, delay: 0.35, flapSpeed: 0.16, wobbleSpeed: 0.31, opacity: 1, glow: 'rgba(255, 113, 139, 0.6)' },
  { id: 8, x0: -8, y0: 85, xmid: 42, ymid: 38, x1: 112, y1: -6, rot0: -35, rotmid: -37, rot1: -39, scale: 0.95, duration: 1.8, delay: 0.25, flapSpeed: 0.13, wobbleSpeed: 0.27, opacity: 0.9, glow: 'rgba(255, 113, 139, 0.4)' },
  { id: 9, x0: -14, y0: 82, xmid: 38, ymid: 35, x1: 106, y1: -10, rot0: -33, rotmid: -35, rot1: -37, scale: 1.0, duration: 1.65, delay: 0.3, flapSpeed: 0.14, wobbleSpeed: 0.28, opacity: 0.9, glow: 'rgba(255, 113, 139, 0.4)' },
  { id: 10, x0: -6, y0: 70, xmid: 48, ymid: 25, x1: 114, y1: -18, rot0: -38, rotmid: -40, rot1: -42, scale: 0.6, duration: 1.55, delay: 0.15, flapSpeed: 0.11, wobbleSpeed: 0.25, opacity: 0.7, glow: 'rgba(255, 113, 139, 0.3)' },
  { id: 11, x0: -10, y0: 78, xmid: 52, ymid: 42, x1: 116, y1: 5, rot0: -28, rotmid: -30, rot1: -32, scale: 1.15, duration: 2.0, delay: 0.4, flapSpeed: 0.15, wobbleSpeed: 0.3, opacity: 0.95, glow: 'rgba(255, 113, 139, 0.45)' },
  { id: 12, x0: -5, y0: 100, xmid: 48, ymid: 50, x1: 115, y1: 2, rot0: -30, rotmid: -32, rot1: -34, scale: 1.6, duration: 1.85, delay: 0.45, flapSpeed: 0.16, wobbleSpeed: 0.33, opacity: 1, glow: 'rgba(255, 113, 139, 0.6)' },
  { id: 13, x0: -15, y0: 60, xmid: 45, ymid: 18, x1: 108, y1: -22, rot0: -42, rotmid: -44, rot1: -46, scale: 0.75, duration: 1.45, delay: 0.38, flapSpeed: 0.12, wobbleSpeed: 0.26, opacity: 0.8, glow: 'rgba(255, 113, 139, 0.35)' },
  { id: 14, x0: 15, y0: 108, xmid: 62, ymid: 48, x1: 118, y1: -4, rot0: -31, rotmid: -33, rot1: -35, scale: 1.05, duration: 1.8, delay: 0.5, flapSpeed: 0.14, wobbleSpeed: 0.29, opacity: 0.9, glow: 'rgba(255, 113, 139, 0.4)' },
  { id: 15, x0: -8, y0: 42, xmid: 46, ymid: 12, x1: 110, y1: -16, rot0: -36, rotmid: -38, rot1: -40, scale: 0.7, duration: 1.5, delay: 0.42, flapSpeed: 0.11, wobbleSpeed: 0.25, opacity: 0.75, glow: 'rgba(255, 113, 139, 0.3)' },
  { id: 16, x0: -12, y0: 92, xmid: 36, ymid: 58, x1: 114, y1: 18, rot0: -23, rotmid: -25, rot1: -27, scale: 1.25, duration: 2.1, delay: 0.32, flapSpeed: 0.15, wobbleSpeed: 0.3, opacity: 0.9, glow: 'rgba(255, 113, 139, 0.45)' },
  { id: 17, x0: -10, y0: 88, xmid: 44, ymid: 36, x1: 112, y1: -8, rot0: -33, rotmid: -35, rot1: -37, scale: 1.4, duration: 1.7, delay: 0.55, flapSpeed: 0.15, wobbleSpeed: 0.3, opacity: 0.95, glow: 'rgba(255, 113, 139, 0.5)' },
  { id: 18, x0: -15, y0: 72, xmid: 42, ymid: 28, x1: 108, y1: -14, rot0: -37, rotmid: -39, rot1: -41, scale: 0.55, duration: 1.6, delay: 0.6, flapSpeed: 0.11, wobbleSpeed: 0.24, opacity: 0.65, glow: 'rgba(255, 113, 139, 0.25)' },
  { id: 19, x0: -6, y0: 96, xmid: 50, ymid: 42, x1: 116, y1: -2, rot0: -32, rotmid: -34, rot1: -36, scale: 1.1, duration: 1.75, delay: 0.68, flapSpeed: 0.13, wobbleSpeed: 0.28, opacity: 0.9, glow: 'rgba(255, 113, 139, 0.45)' },
  { id: 20, x0: -12, y0: 102, xmid: 46, ymid: 46, x1: 114, y1: 4, rot0: -29, rotmid: -31, rot1: -33, scale: 1.35, duration: 1.8, delay: 0.75, flapSpeed: 0.15, wobbleSpeed: 0.31, opacity: 0.95, glow: 'rgba(255, 113, 139, 0.5)' },
];

export function BatSwarm({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 3000);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="bat-swarm-overlay" aria-hidden="true">
      {BATS.map(bat => {
        const style: Record<string, string | number> = {
          '--x0': `${bat.x0}vw`,
          '--y0': `${bat.y0}vh`,
          '--xmid': `${bat.xmid}vw`,
          '--ymid': `${bat.ymid}vh`,
          '--x1': `${bat.x1}vw`,
          '--y1': `${bat.y1}vh`,
          '--rot0': `${bat.rot0}deg`,
          '--rotmid': `${bat.rotmid}deg`,
          '--rot1': `${bat.rot1}deg`,
          '--scale': bat.scale,
          '--duration': `${bat.duration}s`,
          '--delay': `${bat.delay}s`,
          '--flap-speed': `${bat.flapSpeed}s`,
          '--wobble-speed': `${bat.wobbleSpeed}s`,
          '--opacity': bat.opacity,
          '--glow': bat.glow,
        };

        return (
          <div key={bat.id} className="bat-flight" style={style}>
            <div className="bat-wobble">
              <div className="bat-wings">
                <svg
                  className="bat-silhouette"
                  viewBox="0 0 32 32"
                  fill="#150f1f"
                  stroke="#e5b0cd"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 10c4 1 6 0 9-2l1 5 3-2 3 2 1-5c3 2 5 3 9 2-1 5-3 8-6 11-1-3-3-3-5-2l-2 5-2-5c-2-1-4-1-5 2-3-3-5-6-6-11Z" />
                  <path d="m12 15 2 1m6-1-2 1" stroke="#ff718b" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="m13 18 1 4 1-3h2l1 3 1-4" stroke="#fff1df" strokeWidth="1.2" />
                </svg>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
