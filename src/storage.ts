import { flatBands, loadPresets, validateBands, validatePreamp } from './eq';
import type { EqSettings, Preset } from './eq';

export const LIBRARY_KEY = 'fiiofixer.presets.v1';
export const DRAFT_KEY = 'fiiofixer.draft.v1';
const LEGACY_LIBRARY_KEY = 'earform.presets.v1';
export const MAX_BACKUP_SIZE = 2_000_000;
type LocalStore = Pick<Storage, 'getItem' | 'setItem'>;
export interface Draft extends EqSettings { name: string; selected: number }
export const emptyDraft = (): Draft => ({ name: 'Untitled EQ', bands: flatBands(), preampDb: 0, selected: 0 });

export function readLibrary(storage: LocalStore): { presets: Preset[]; error: string | null } {
  try {
    const current = storage.getItem(LIBRARY_KEY);
    if (current !== null) return { presets: loadPresets(JSON.parse(current)), error: null };
    const legacy = storage.getItem(LEGACY_LIBRARY_KEY);
    if (legacy === null) return { presets: [], error: null };
    const presets = loadPresets(JSON.parse(legacy));
    try { storage.setItem(LIBRARY_KEY, JSON.stringify(presets)); }
    catch { return { presets, error: 'Presets loaded, but storage is unavailable. Back up your library before closing.' }; }
    return { presets, error: null };
  } catch {
    return { presets: [], error: 'Could not load saved presets. Existing browser data was kept. Restore a library backup or export your draft.' };
  }
}

export function readDraft(storage: LocalStore): { draft: Draft; restored: boolean; error: string | null } {
  try {
    const saved = storage.getItem(DRAFT_KEY);
    if (saved === null) return { draft: emptyDraft(), restored: false, error: null };
    const value: unknown = JSON.parse(saved);
    if (typeof value !== 'object' || value === null || !('bands' in value) || !('name' in value) || typeof value.name !== 'string' || !('preampDb' in value) || !('selected' in value) || typeof value.selected !== 'number' || !Number.isInteger(value.selected) || value.selected < 0 || value.selected > 9) throw new Error('Invalid draft');
    return { draft: { name: value.name.slice(0, 60), bands: validateBands(value.bands), preampDb: validatePreamp(value.preampDb), selected: value.selected }, restored: true, error: null };
  } catch {
    return { draft: emptyDraft(), restored: false, error: 'Could not restore the draft. Existing browser data was kept.' };
  }
}

export function exportLibrary(presets: Preset[]): string {
  return JSON.stringify({ format: 'fiiofixer-library', version: 1, exportedAt: new Date().toISOString(), presets: loadPresets(presets) }, null, 2);
}

export function parseLibrary(text: string): Preset[] {
  if (text.length > MAX_BACKUP_SIZE) throw new Error('Choose a library backup under 2 MB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (typeof value !== 'object' || value === null || !('format' in value) || value.format !== 'fiiofixer-library' || !('version' in value) || value.version !== 1 || !('presets' in value) || !Array.isArray(value.presets) || value.presets.length > 1000) throw new Error('Choose a FiiOFixer library backup with up to 1,000 presets. For a single EQ, use Import EQ.');
  return loadPresets(value.presets);
}

// Merge by content, not imported IDs. Keep different curves even when names match.
export function mergeLibrary(existing: Preset[], imported: Preset[], newId: () => string = () => crypto.randomUUID()): Preset[] {
  const merged = [...existing];
  const signature = (preset: Preset): string => JSON.stringify({ name: preset.name, preampDb: preset.preampDb, bands: validateBands(preset.bands) });
  const seen = new Set(existing.map(signature));
  for (const preset of imported) {
    const key = signature(preset);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...preset, id: newId() });
  }
  return merged;
}
