import { describe, expect, it } from 'vitest';
import { flatBands } from './eq';
import { hardwareTarget, readHardwareBackup } from './hardware';
import { parseEq } from './protocol';

describe('hardware apply boundary', () => {
  it('quantizes the hardware target while preserving the local draft', () => {
    const bands = flatBands(); bands[9] = { ...bands[9], gain: -1.04, frequency: 15999.8, q: 0.723 };
    const raw = hardwareTarget({ bands, preampDb: 0 }, 100);
    expect(Array.from(raw.slice(72, 79))).toEqual([255, 246, 62, 128, 0, 72, 0]);
    expect(parseEq(raw, 100)[9]).toEqual({ ...bands[9], gain: -1, frequency: 16000, q: 0.72 });
    expect(bands[9].q).toBe(0.723);
  });
  it('rejects unsupported settings instead of silently losing them', () => {
    const settings = { bands: flatBands(), preampDb: -3 };
    expect(() => hardwareTarget(settings, 100)).toThrow('preamp');
    settings.preampDb = 0; settings.bands[0].enabled = false;
    expect(() => hardwareTarget(settings, 100)).toThrow('bypass');
    settings.bands[0].enabled = true; settings.bands[0].gain = 13;
    expect(() => hardwareTarget(settings, 100)).toThrow('-12 to +12');
    settings.bands[0].gain = 0; settings.bands[0].type = 'highPass';
    expect(() => hardwareTarget(settings, 100)).toThrow('Pass filters');
  });
  it('validates the persisted original EQ before offering restoration', () => {
    const raw = hardwareTarget({ bands: flatBands(), preampDb: 0 }, 100);
    expect(readHardwareBackup({ getItem: () => JSON.stringify(Array.from(raw)) })).toEqual(raw);
    expect(readHardwareBackup({ getItem: () => '[256]' })).toBeNull();
    expect(readHardwareBackup({ getItem: () => 'broken' })).toBeNull();
  });
});
