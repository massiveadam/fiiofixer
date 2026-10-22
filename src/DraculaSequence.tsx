import { useEffect, useRef, useState } from 'react';
import { BatSwarm } from './BatSwarm';
import { DRACULA_TIMING } from './draculaSound';

const BAT_START_MS = DRACULA_TIMING.batStart * 1000;

// Cinematic switch: the lights go out, the organ and voice begin, the laugh
// follows, then the bats cross the screen as the editor is revealed.
export function DraculaSequence({ onComplete }: { onComplete: () => void }) {
  const [bats, setBats] = useState(false);
  const done = useRef(onComplete);
  done.current = onComplete;

  useEffect(() => {
    document.documentElement.dataset.draculaIntro = '1';
    const batTimer = window.setTimeout(() => setBats(true), BAT_START_MS);
    const doneTimer = window.setTimeout(() => {
      delete document.documentElement.dataset.draculaIntro;
      done.current();
    }, DRACULA_TIMING.sequenceMs);
    return () => {
      window.clearTimeout(batTimer);
      window.clearTimeout(doneTimer);
      delete document.documentElement.dataset.draculaIntro;
    };
  }, []);

  return <>
    <div className="dracula-lights-out" aria-hidden="true" />
    {bats && <BatSwarm onComplete={() => {}} />}
  </>;
}
