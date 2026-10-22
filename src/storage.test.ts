import { describe, expect, it } from 'vitest';
import { flatBands } from './eq';
import type { Preset } from './eq';
import { DRAFT_KEY, LIBRARY_KEY, emptyDraft, exportLibrary, mergeLibrary, parseLibrary, readDraft, readLibrary } from './storage';

function store(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
function preset(): Preset {
  const bands = flatBands();
  bands[0] = { frequency: 75, gain: 3.1234, q: 0.707107, type: 'lowShelf', enabled: false };
  return { id: 'old-id', name: 'Everyday', bands, preampDb: -4.2389 };
}
describe('portable library and browser persistence', () => {
  it('migrates the Earform library while preserving the original data', () => {
    const legacy = JSON.stringify([preset()]);
    const storage = store({ 'earform.presets.v1': legacy });
    expect(readLibrary(storage)).toEqual({ presets: [preset()], error: null });
    expect(storage.getItem(LIBRARY_KEY)).toBe(legacy);
    expect(storage.getItem('earform.presets.v1')).toBe(legacy);
  });
  it('does not overwrite damaged current data with an older library', () => {
    const storage = store({ [LIBRARY_KEY]: 'broken', 'earform.presets.v1': JSON.stringify([preset()]) });
    expect(readLibrary(storage).error).toContain('Could not load');
    expect(storage.getItem(LIBRARY_KEY)).toBe('broken');
  });
  it('round-trips a complete library with preamp and disabled-filter precision', () => {
    expect(parseLibrary(exportLibrary([preset()]))).toEqual([preset()]);
  });
  it('merges without replacing existing presets or duplicating repeated imports', () => {
    const original = preset();
    const changed = { ...preset(), preampDb: -8 };
    const merged = mergeLibrary([original], [preset(), changed], () => 'new-id');
    expect(merged).toEqual([original, { ...changed, id: 'new-id' }]);
    expect(mergeLibrary(merged, [changed])).toEqual(merged);
    expect(original.preampDb).toBe(-4.2389);
  });
  it('rejects the whole backup if any preset is malformed or the version is unsupported', () => {
    const backup = JSON.parse(exportLibrary([preset()]));
    backup.presets.push({ name: 'Broken' });
    expect(() => parseLibrary(JSON.stringify(backup))).toThrow('incomplete');
    expect(() => parseLibrary(JSON.stringify({ ...backup, version: 2 }))).toThrow('library backup');
  });
  it('keeps curves that differ by a small imported value', () => {
    const original = preset(), changed = preset();
    changed.bands[0].q += 0.0000001;
    expect(mergeLibrary([original], [changed], () => 'new-id')).toHaveLength(2);
  });
  it('keeps migrated presets available when storage cannot write', () => {
    const storage = { getItem: (key: string) => key === 'earform.presets.v1' ? JSON.stringify([preset()]) : null, setItem: () => { throw new Error('Full'); } };
    const result = readLibrary(storage);
    expect(result.presets).toEqual([preset()]);
    expect(result.error).toContain('Back up');
  });
  it('restores the exact draft and selection, with no connection state', () => {
    const draft = { name: 'Work in progress', bands: preset().bands, preampDb: -4.2389, selected: 8 };
    expect(readDraft(store({ [DRAFT_KEY]: JSON.stringify(draft) }))).toEqual({ draft, restored: true, error: null });
    const storage = store({ [DRAFT_KEY]: JSON.stringify({ ...draft, selected: 20 }) });
    expect(readDraft(storage).draft).toEqual(emptyDraft());
    expect(readDraft(storage).error).toContain('Could not restore');
    expect(storage.getItem(DRAFT_KEY)).toContain('20');
  });
});
