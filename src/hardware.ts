import { validateBands, validatePreamp } from './eq';
import type { EqSettings } from './eq';
import { packet, parseEq } from './protocol';
import type { QScale } from './protocol';

export const HARDWARE_BACKUP_KEY = 'fiiofixer.hardware-backup.v1';

// Preserve imported precision locally; quantize only the explicit hardware apply.
export function hardwareTarget(settings: EqSettings, scale: QScale): Uint8Array {
  const bands = validateBands(settings.bands);
  if (validatePreamp(settings.preampDb) !== 0) throw new Error('Set preset preamp to 0 dB before applying. EH11 preamp control is unverified.');
  const payload = new Uint8Array(73);
  payload.set([1, 0, 9]);
  const view = new DataView(payload.buffer);
  bands.forEach((band, index) => {
    if (!band.enabled) throw new Error(`Band ${index + 1} is off. Filter bypass is unverified; enable it or use a 0 dB peaking filter.`);
    if (Math.abs(band.gain) > 12) throw new Error(`Band ${index + 1}: hardware apply supports -12 to +12 dB.`);
    if (band.type !== 'peak' && band.type !== 'lowShelf' && band.type !== 'highShelf') throw new Error('Hardware apply supports peaking and shelf filters. Pass filters are unverified.');
    const at = 3 + index * 7;
    view.setInt16(at, Math.round(band.gain * 10));
    view.setUint16(at + 2, Math.round(band.frequency));
    view.setUint16(at + 4, Math.max(1, Math.round(band.q * scale)));
    payload[at + 6] = band.type === 'peak' ? 0 : band.type === 'lowShelf' ? 1 : 2;
  });
  return packet([3, 13], Array.from(payload));
}

export function readHardwareBackup(storage: Pick<Storage, 'getItem'>): Uint8Array | null {
  try {
    const data: unknown = JSON.parse(storage.getItem(HARDWARE_BACKUP_KEY) ?? 'null');
    if (!Array.isArray(data) || !data.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null;
    const bytes = Uint8Array.from(data);
    parseEq(bytes, 100);
    return bytes;
  } catch { return null; }
}
