export type FilterType = 'peak' | 'lowShelf' | 'highShelf' | 'lowPass' | 'highPass';
export interface Band { frequency: number; gain: number; q: number; type: FilterType; enabled: boolean }
export interface EqSettings { bands: Band[]; preampDb: number }
export interface Preset extends EqSettings { id: string; name: string }
export const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const FILTER_NAMES: Record<FilterType, string> = {
  peak: 'Peaking (PK)', lowShelf: 'Low shelf (LSC)', highShelf: 'High shelf (HSC)', lowPass: 'Low pass (LP)', highPass: 'High pass (HP)',
};
export function isFilterType(value: unknown): value is FilterType {
  return value === 'peak' || value === 'lowShelf' || value === 'highShelf' || value === 'lowPass' || value === 'highPass';
}
export const flatBands = (): Band[] => FREQUENCIES.map(frequency => ({ frequency, gain: 0, q: 0.71, type: 'peak', enabled: true }));
export const copyBands = (bands: Band[]): Band[] => bands.map(band => ({ ...band }));
export function validateBands(value: unknown): Band[] {
  if (!Array.isArray(value) || value.length !== 10) throw new Error('An EH11 preset must contain exactly 10 bands.');
  return value.map((band: unknown, i) => {
    if (typeof band !== 'object' || band === null || !('frequency' in band) || !('gain' in band) || !('q' in band) || !('type' in band)) throw new Error(`Band ${i + 1} is incomplete.`);
    const { frequency, gain, q, type } = band;
    if (typeof frequency !== 'number' || !Number.isFinite(frequency) || frequency < 20 || frequency > 20000) throw new Error(`Band ${i + 1}: frequency must be 20–20,000 Hz.`);
    if (typeof gain !== 'number' || !Number.isFinite(gain) || Math.abs(gain) > 40) throw new Error(`Band ${i + 1}: gain must be between -40 and +40 dB.`);
    if (typeof q !== 'number' || !Number.isFinite(q) || q < 0.01 || q > 100) throw new Error(`Band ${i + 1}: Q must be between 0.01 and 100.`);
    if (!isFilterType(type)) throw new Error(`Band ${i + 1}: unsupported filter type.`);
    const enabled = 'enabled' in band ? band.enabled : true;
    if (typeof enabled !== 'boolean') throw new Error(`Band ${i + 1}: enabled must be true or false.`);
    return { frequency, gain, q, type, enabled };
  });
}
export function sameBands(a: Band[], b: Band[]): boolean {
  return a.length === b.length && a.every((band, i) => {
    const other = b[i];
    return Math.abs(band.frequency - other.frequency) < 1e-6 && Math.abs(band.gain - other.gain) < 1e-6 && Math.abs(band.q - other.q) < 1e-6 && band.type === other.type && band.enabled === other.enabled;
  });
}
export function validatePreamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -100 || value > 40) throw new Error('Preamp must be between -100 and +40 dB.');
  return value;
}
export function parsePreset(text: string): EqSettings & { name: string } {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 100_000) throw new Error('Paste an EQ preset under 100 KB.');
  if (trimmed.startsWith('{')) {
    let data: unknown;
    try { data = JSON.parse(trimmed); } catch { throw new Error('The preset is not valid JSON.'); }
    if (typeof data !== 'object' || data === null || !('bands' in data)) throw new Error('JSON presets need a bands array.');
    return { name: 'name' in data && typeof data.name === 'string' ? data.name.slice(0, 60) : 'Imported preset', bands: validateBands(data.bands), preampDb: validatePreamp('preampDb' in data ? data.preampDb : 0) };
  }
  const bands = flatBands().map(band => ({ ...band, enabled: false }));
  const occupied = new Set<number>();
  let preampDb = 0, preampSeen = false;
  const types: Record<string, FilterType> = { PK: 'peak', LS: 'lowShelf', LSQ: 'lowShelf', LSC: 'lowShelf', HS: 'highShelf', HSQ: 'highShelf', HSC: 'highShelf', LP: 'lowPass', HP: 'highPass' };
  for (const line of trimmed.split(/\r?\n/).map(line => line.split('#')[0].trim()).filter(line => line && !line.startsWith('*'))) {
    if (/^GraphicEQ:/i.test(line)) throw new Error('This is a graphic EQ export. Import Squig.link’s parametric Export filters text for the EH11.');
    if (/^Channel:/i.test(line)) {
      if (/^Channel:\s*ALL$/i.test(line)) continue;
      throw new Error('Separate left/right channel presets are not supported. Export one shared EQ from Squig.link.');
    }
    const preamp = /^Preamp:\s*([+-]?[\d.]+)\s*dB$/i.exec(line);
    if (preamp) {
      if (preampSeen) throw new Error('Use one shared preamp value. Multiple preamp lines need an explicit conversion.');
      preampDb = validatePreamp(Number(preamp[1])); preampSeen = true;
      continue;
    }
    const empty = /^Filter\s+(\d+):\s*OFF\s+None$/i.exec(line);
    if (empty) {
      const index = Number(empty[1]) - 1;
      if (index < 0 || index > 9 || occupied.has(index)) throw new Error('The EH11 editor supports unique filter numbers from 1 to 10.');
      occupied.add(index); continue;
    }
    const match = /^Filter\s+(\d+):\s*(ON|OFF)\s+(PK|LS[QC]?|HS[QC]?|LP|HP)\s+Fc\s+([\d.]+)\s+Hz(?:\s+Gain\s+([+-]?[\d.]+)\s+dB)?(?:\s+Q\s+([\d.]+))?$/i.exec(line);
    if (!match) throw new Error(`Unrecognized EQ line: ${line.slice(0, 80)}`);
    const index = Number(match[1]) - 1;
    if (index < 0 || index > 9 || occupied.has(index)) throw new Error('The EH11 editor supports unique filter numbers from 1 to 10.');
    occupied.add(index);
    const type = types[match[3].toUpperCase()];
    if (!type) throw new Error('Unsupported filter.');
    if (!match[5] && type !== 'lowPass' && type !== 'highPass') throw new Error('Peaking and shelf filters need a gain value.');
    const simpleShelf = ['LS', 'HS'].includes(match[3].toUpperCase());
    if (!match[6] && !simpleShelf) throw new Error(`Filter ${index + 1} needs a Q value.`);
    bands[index] = { frequency: Number(match[4]), gain: Number(match[5] ?? 0), q: Number(match[6] ?? Math.SQRT1_2), type, enabled: match[2].toUpperCase() === 'ON' };
  }
  if (occupied.size === 0) throw new Error('No filters found. Paste Equalizer APO text or an FiiOFixer JSON preset.');
  return { name: 'Imported preset', bands: validateBands(bands), preampDb };
}
export function exportPreset(name: string, bands: Band[], preampDb = 0): string {
  return JSON.stringify({ version: 2, name, preampDb: validatePreamp(preampDb), bands: validateBands(bands) }, null, 2);
}
export function exportApo(bands: Band[], preampDb: number): string {
  const types: Record<FilterType, string> = { peak: 'PK', lowShelf: 'LSC', highShelf: 'HSC', lowPass: 'LP', highPass: 'HP' };
  return `Preamp: ${validatePreamp(preampDb)} dB\r\n` + validateBands(bands).map((band, i) => `Filter ${i + 1}: ${band.enabled ? 'ON' : 'OFF'} ${types[band.type]} Fc ${band.frequency} Hz Gain ${band.gain} dB Q ${band.q}`).join('\r\n') + '\r\n';
}
export function loadPresets(value: unknown): Preset[] {
  if (!Array.isArray(value)) throw new Error('Saved presets have an invalid format.');
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || !('id' in item) || typeof item.id !== 'string' || !('name' in item) || typeof item.name !== 'string' || !('bands' in item)) throw new Error('A saved preset is incomplete.');
    return { id: item.id, name: item.name.slice(0, 60), bands: validateBands(item.bands), preampDb: validatePreamp('preampDb' in item ? item.preampDb : 0) };
  });
}
export function formatFrequency(frequency: number): string { return frequency >= 1000 ? `${Number((frequency / 1000).toFixed(2))}k` : String(Math.round(frequency)); }

// RBJ Audio EQ Cookbook biquads at 48 kHz. This is a preview, not a measured EH11 response.
export function responseAt(band: Band, frequency: number): number {
  if (!band.enabled) return 0;
  const sampleRate = 48000;
  const w0 = 2 * Math.PI * band.frequency / sampleRate;
  const c = Math.cos(w0), s = Math.sin(w0), alpha = s / (2 * band.q), A = Math.pow(10, band.gain / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (band.type) {
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * c; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * c; a2 = 1 - alpha / A; break;
    case 'lowShelf': {
      const t = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * c + t); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - t);
      a0 = (A + 1) + (A - 1) * c + t; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - t; break;
    }
    case 'highShelf': {
      const t = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * c + t); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - t);
      a0 = (A + 1) - (A - 1) * c + t; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - t; break;
    }
    case 'lowPass': b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha; break;
    case 'highPass': b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha; break;
  }
  const w = 2 * Math.PI * frequency / sampleRate;
  const magnitude = (x0: number, x1: number, x2: number) => (x0 + x1 * Math.cos(w) + x2 * Math.cos(2 * w)) ** 2 + (x1 * Math.sin(w) + x2 * Math.sin(2 * w)) ** 2;
  return 10 * Math.log10(Math.max(1e-12, magnitude(b0, b1, b2)) / Math.max(1e-12, magnitude(a0, a1, a2)));
}
