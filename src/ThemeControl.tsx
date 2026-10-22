import { useState } from 'react';
import { Sun } from 'lucide-react';
import { applyTheme, readTheme, THEME_KEY } from './theme';
import draculaPortrait from './assets/dracula-portrait.svg';
import { BatSwarm } from './BatSwarm';

export function DraculaMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10c4 1 6 0 9-2l1 5 3-2 3 2 1-5c3 2 5 3 9 2-1 5-3 8-6 11-1-3-3-3-5-2l-2 5-2-5c-2-1-4-1-5 2-3-3-5-6-6-11Z"/>
    <path d="m12 15 2 1m6-1-2 1" stroke="var(--vampire-red, currentColor)" strokeLinecap="round"/>
    <path d="m13 18 1 4 1-3h2l1 3 1-4" stroke="var(--vampire-ivory, currentColor)" strokeWidth="1.2"/>
  </svg>;
}

export function ThemeWords({ light, dark }: { light: string; dark: string }) {
  return <><span className="day-copy">{light}</span><span className="night-copy">{dark}</span></>;
}

export function ListeningChamber() {
  return <div className="listening-chamber night-only">
    <div className="chamber-title"><DraculaMark size={36}/><div><p>The listening chamber</p><span>Enter freely. Listen after dark.</span></div></div>
    <span className="chamber-edition">Dracula edition</span>
  </div>;
}

export function DraculaPortrait() {
  return <figure className="dracula-portrait night-only"><img src={draculaPortrait} alt="Count Dracula with ivory fangs and a crimson-lined cape beneath a moonlit gothic arch"/><figcaption><span>Children of the night.</span><small>What music they make.</small></figcaption></figure>;
}

export function ThemeControl() {
  const [theme, setTheme] = useState(readTheme);
  const [swarming, setSwarming] = useState(false);
  const [swarmKey, setSwarmKey] = useState(0);
  const dark = theme === 'dracula';

  function toggle(): void {
    const next = dark ? 'light' : 'dracula';
    applyTheme(next);
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Appearance still changes when storage is unavailable. */ }

    if (next === 'dracula') {
      const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (!reducedMotion) {
        setSwarmKey(k => k + 1);
        setSwarming(true);
      }
    } else {
      setSwarming(false);
    }
  }

  return <>
    <button type="button" className="theme-switch" aria-label="Dracula theme" aria-pressed={dark} title={dark ? 'Return to light theme' : 'Turn on Dracula theme'} onClick={toggle}>
      {dark ? <Sun size={21}/> : <DraculaMark size={25}/>}
      <span className="theme-switch-label">{dark ? 'Daylight' : 'Dracula'}</span>
    </button>
    {swarming && <BatSwarm key={swarmKey} onComplete={() => setSwarming(false)} />}
  </>;
}
