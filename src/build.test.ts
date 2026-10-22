import { describe, expect, it } from 'vitest';
import { isNewerBuild, parseRemoteBuild } from './build';

describe('published build manifest', () => {
  it('accepts a complete manifest', () => {
    expect(parseRemoteBuild({ version: '0.8.0', buildId: 'abc123' })).toEqual({ version: '0.8.0', id: 'abc123' });
  });

  it('rejects missing or malformed fields', () => {
    expect(parseRemoteBuild(null)).toBeNull();
    expect(parseRemoteBuild('0.8.0')).toBeNull();
    expect(parseRemoteBuild({ version: '0.8.0' })).toBeNull();
    expect(parseRemoteBuild({ version: '', buildId: 'abc123' })).toBeNull();
    expect(parseRemoteBuild({ version: 8, buildId: 'abc123' })).toBeNull();
  });

  it('flags only a different build id as an update', () => {
    expect(isNewerBuild({ version: '0.8.0', id: 'new' }, 'old')).toBe(true);
    expect(isNewerBuild({ version: '0.8.0', id: 'old' }, 'old')).toBe(false);
  });
});
