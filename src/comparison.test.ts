import { describe, expect, it } from 'vitest';
import { flatBands } from './eq';
import { hardwareTarget } from './hardware';
import { COMPARISON_KEY, activeComparison, makeComparison, readComparison, sameCurve } from './comparison';

function curve(): Uint8Array {
  const bands = flatBands();
  bands[0] = { frequency: 213, gain: -3.7, q: 1.23, type: 'lowShelf', enabled: true };
  bands[9].gain = 4.2;
  return hardwareTarget({ bands, preampDb: 0 }, 100);
}

describe('EQ-on flat comparison', () => {
  it('offers original recovery only for the same device and exact comparison frame', () => {
    const saved=makeComparison('test-device',curve());
    expect(activeComparison(saved,'test-device',saved.flat)?.eq).toEqual(saved.eq);
    expect(activeComparison(saved,'other-device',saved.flat)).toBeNull();
    expect(activeComparison(saved,'test-device',saved.eq)).toBeNull();
    expect(activeComparison(null,'test-device',saved.flat)).toBeNull();
  });
  it('zeros every filter without losing the exact original curve', () => {
    const original = curve(), saved = original.slice();
    const comparison = makeComparison('test-device', original);
    for (let i = 0; i < 10; i++) {
      const at = 9+i*7;
      expect(Array.from(comparison.flat.slice(at,at+2))).toEqual([0,0]);
      expect(comparison.flat[at+6]).toBe(0);
      expect(comparison.flat.slice(at+2,at+6)).toEqual(original.slice(at+2,at+6));
    }
    original[9] = 99;
    expect(comparison.eq).toEqual(saved);
  });

  it('recovers a device-bound original curve after reload and derives flat again', () => {
    const saved = makeComparison('test-device',curve());
    const getItem = (key: string): string | null => key === COMPARISON_KEY ? JSON.stringify({deviceId:saved.deviceId,eq:Array.from(saved.eq)}) : null;
    expect(readComparison({getItem})).toEqual(saved);
    expect(sameCurve(saved.eq,saved.flat)).toBe(false);
  });

  it.each(['{}','{"deviceId":"a","eq":[256]}','{"deviceId":null,"eq":[]}','not json'])('rejects corrupt recovery data: %s', value => {
    expect(readComparison({getItem:()=>value})).toBeNull();
  });

  it('refuses comparison when the original filters cannot be restored by the helper', () => {
    const unsupported = curve(); unsupported[15] = 3;
    expect(() => makeComparison('test-device',unsupported)).toThrow('restore');
    const tooLoud = curve(); tooLoud[9] = 0; tooLoud[10] = 121;
    expect(() => makeComparison('test-device',tooLoud)).toThrow('restore');
  });
});
