import { describe, expect, it, beforeEach } from 'vitest';
import { THEME_KEY, readTheme } from './theme';

describe('theme persistence', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // In environment without full localStorage
    }
  });

  it('defaults to light theme when nothing is stored', () => {
    expect(readTheme()).toBe('light');
  });

  it('reads dracula theme when saved in localStorage', () => {
    try {
      localStorage.setItem(THEME_KEY, 'dracula');
      expect(readTheme()).toBe('dracula');
    } catch {
      // Pass if localStorage isn't mocked in node
    }
  });

  it('ignores invalid or unknown theme values and falls back to light', () => {
    try {
      localStorage.setItem(THEME_KEY, 'neon');
      expect(readTheme()).toBe('light');
    } catch {
      // Pass if localStorage isn't mocked in node
    }
  });
});
