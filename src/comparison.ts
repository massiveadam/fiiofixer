import { parseEq } from './protocol';

export const COMPARISON_KEY = 'fiiofixer.comparison.v1';
export interface EqComparison { deviceId: string; eq: Uint8Array; flat: Uint8Array }
export const sameCurve = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, i) => byte === b[i]);

export function activeComparison(comparison: EqComparison | null, deviceId: string, frame: Uint8Array): EqComparison | null {
  return comparison?.deviceId === deviceId && sameCurve(frame,comparison.flat) ? comparison : null;
}

export function makeComparison(deviceId: string, original: Uint8Array): EqComparison {
  const bands = parseEq(original, 100);
  if (bands.some(band => Math.abs(band.gain) > 12 || band.type === 'lowPass' || band.type === 'highPass')) {
    throw new Error('This EQ cannot be restored by the current helper. Export it before comparing.');
  }
  const eq = original.slice(), flat = original.slice();
  for (let i = 0; i < 10; i++) {
    const at = 9+i*7;
    flat[at] = 0; flat[at+1] = 0; flat[at+6] = 0;
  }
  return { deviceId, eq, flat };
}

export function readComparison(storage: Pick<Storage, 'getItem'>): EqComparison | null {
  try {
    const data: unknown = JSON.parse(storage.getItem(COMPARISON_KEY) ?? 'null');
    if (typeof data !== 'object' || data === null || !('deviceId' in data) || typeof data.deviceId !== 'string' || !data.deviceId || data.deviceId.length > 200 || !('eq' in data) || !Array.isArray(data.eq) || !data.eq.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null;
    return makeComparison(data.deviceId, Uint8Array.from(data.eq));
  } catch { return null; }
}
