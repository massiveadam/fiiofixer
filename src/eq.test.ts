import { describe, expect, it } from 'vitest';
import { exportApo, exportPreset, flatBands, loadPresets, parsePreset, responseAt, sameBands, validateBands } from './eq';
import type { Band } from './eq';

describe('EQ import and preview', () => {
  it('round-trips a complete JSON preset', () => {
    const bands = flatBands(); bands[0] = { frequency: 40, gain: -2.5, q: 0.8, type: 'lowShelf', enabled: true };
    expect(parsePreset(exportPreset('Everyday', bands, -4.5))).toEqual({ name: 'Everyday', bands, preampDb: -4.5 });
  });
  it('imports sparse APO filters and retains disabled filter parameters', () => {
    const result = parsePreset('Preamp: 0 dB\nFilter 2: ON PK Fc 500 Hz Gain -3.5 dB Q 1.2\nFilter 5: OFF HP Fc 60 Hz Q 0.7');
    expect(result.bands).toHaveLength(10);
    expect(result.bands[1]).toEqual({ frequency: 500, gain: -3.5, q: 1.2, type: 'peak', enabled: true });
    expect(result.bands[4].type).toBe('highPass');
    expect(result.bands[4].gain).toBe(0);
    expect(result.bands[4].enabled).toBe(false);
  });
  it('preserves Squig.link preamp, decimal precision, shelves and disabled states', () => {
    const squig = '\uFEFFPreamp: -4.2389 dB\r\nFilter 1: ON LSC Fc 35 Hz Gain 4.1234 dB Q 0.707107\r\nFilter 2: ON PK Fc 1300 Hz Gain -2.4567 dB Q 1.234567\r\nFilter 3: OFF HSC Fc 8000 Hz Gain 1.8 dB Q 0.71\r\n';
    const preset = parsePreset(squig);
    expect(preset.preampDb).toBe(-4.2389);
    expect(preset.bands[0]).toEqual({ frequency: 35, gain: 4.1234, q: 0.707107, type: 'lowShelf', enabled: true });
    expect(preset.bands[2]).toEqual({ frequency: 8000, gain: 1.8, q: 0.71, type: 'highShelf', enabled: false });
    const roundTrip = parsePreset(exportApo(preset.bands, preset.preampDb));
    expect(roundTrip.bands).toEqual(preset.bands);
    expect(roundTrip.preampDb).toBe(preset.preampDb);
    expect(exportApo(preset.bands, preset.preampDb)).toContain('OFF HSC');
  });
  it('accepts shelf aliases and default Q for simple shelves', () => {
    const preset = parsePreset('Filter 1: ON LSQ Fc 100 Hz Gain 2 dB Q 0.71\nFilter 2: ON HS Fc 8000 Hz Gain -2 dB');
    expect(preset.bands[0].type).toBe('lowShelf');
    expect(preset.bands[1].q).toBeCloseTo(Math.SQRT1_2);
  });
  it('rejects stereo and graphic exports explicitly without flattening their meaning', () => {
    expect(() => parsePreset('Channel: L\nFilter 1: ON PK Fc 100 Hz Gain 3 dB Q 0.7')).toThrow('Separate left/right');
    expect(() => parsePreset('GraphicEQ: 20 0; 100 2')).toThrow('graphic EQ');
    expect(() => parsePreset('Preamp: -4 dB\nPreamp: -2 dB')).toThrow('one shared preamp');
  });
  it('rejects duplicate bands, invalid gains, unsupported text and too many filters', () => {
    const line = 'Filter 1: ON PK Fc 100 Hz Gain 3 dB Q 0.7';
    expect(() => parsePreset(`${line}\n${line}`)).toThrow('unique');
    expect(() => parsePreset(line.replace('Gain 3', 'Gain 50'))).toThrow('gain');
    expect(() => parsePreset(line.replace('Filter 1', 'Filter 11'))).toThrow('unique');
    expect(() => parsePreset('Convolution: example.wav')).toThrow('Unrecognized');
    expect(() => parsePreset('Preamp: 0 dB')).toThrow('No filters');
  });
  it('validates stored data and rejects nonfinite parameters at boundaries', () => {
    expect(() => validateBands(Array(10).fill({ frequency: 100, gain: NaN, q: 1, type: 'peak' }))).toThrow('gain');
    expect(() => loadPresets([{ name: 'Missing id', bands: flatBands() }])).toThrow('incomplete');
    expect(() => loadPresets({})).toThrow('format');
  });
  it('plots zero gain as neutral and a bell center at its set gain', () => {
    for (const frequency of [20, 100, 500, 1000, 10000, 20000]) {
      expect(flatBands().reduce((sum, band) => sum + responseAt(band, frequency), 0)).toBeCloseTo(0, 7);
    }
    expect(responseAt({ frequency: 1000, gain: -4, q: 1.2, type: 'peak', enabled: true }, 1000)).toBeCloseTo(-4, 6);
    expect(responseAt({ frequency: 1000, gain: -4, q: 1.2, type: 'peak', enabled: false }, 1000)).toBe(0);
  });
  it('detects frequency, Q, gain and filter mismatches during readback', () => {
    const a = flatBands(), b = flatBands();
    expect(sameBands(a, b)).toBe(true);
    const patches: Partial<Band>[] = [{ frequency: 100 }, { gain: 0.1 }, { q: 1.2 }, { type: 'highPass' }, { enabled: false }, { q: 0.71001 }];
    for (const patch of patches) {
      expect(sameBands(a, b.map((band, i) => i === 0 ? { ...band, ...patch } : band))).toBe(false);
    }
  });
});
