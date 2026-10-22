import draculaIcon from './assets/dracula-icon.svg';

export type Theme = 'light' | 'dracula';
export const THEME_KEY = 'fiiofixer.theme.v1';
let lightIcon: string | undefined;

export function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'dracula' ? 'dracula' : 'light'; }
  catch { return 'light'; }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content',theme === 'dracula' ? '#17141f' : '#eaf0f5');
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) { lightIcon ??= icon.href; icon.href = theme === 'dracula' ? draculaIcon : lightIcon; }
}
