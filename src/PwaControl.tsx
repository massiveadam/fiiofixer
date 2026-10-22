import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download } from 'lucide-react';
import { BUILD_ID, isNewerBuild, parseRemoteBuild } from './build';

interface InstallPrompt extends Event { prompt(): Promise<void> }
function isInstallPrompt(event: Event): event is InstallPrompt {
  return 'prompt' in event && typeof event.prompt === 'function';
}

const UPDATE_POLL_MS = 60 * 1000;

async function reloadPastServiceWorker(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }
  location.reload();
}

export function PwaControl({ busy, saved, onError }: { busy: boolean; saved: boolean; onError: (message: string) => void }) {
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [buildMismatch, setBuildMismatch] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registration.update().catch(() => {});
      const interval = setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 1000);
      const onFocus = () => {
        registration.update().catch(() => {});
      };
      const onVisibility = (): void => {
        if (document.visibilityState === 'visible') onFocus();
      };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        clearInterval(interval);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    },
    onRegisterError: () => onError('Offline setup failed. Reopen the app while online to retry.'),
  });
  useEffect(() => {
    let current = true;
    async function check(): Promise<void> {
      const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const remote = parseRemoteBuild(await response.json());
      if (current && remote && isNewerBuild(remote, BUILD_ID)) setBuildMismatch(true);
    }
    void check().catch(() => {});
    const interval = setInterval(() => { void check().catch(() => {}); }, UPDATE_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void check().catch(() => {}); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  useEffect(() => {
    const prompt = (event: Event): void => { if (isInstallPrompt(event)) { event.preventDefault(); setInstall(event); } };
    const installed = (): void => setInstall(null);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', prompt); window.removeEventListener('appinstalled', installed); };
  }, []);
  if (buildMismatch) return <button className="button" disabled={busy || !saved} title={saved ? 'A newer version is published. Reload it now.' : 'Save or export your draft before updating'} onClick={() => { void reloadPastServiceWorker().catch(() => onError('Update failed. Reopen the app while online to retry.')); }}>Update app</button>;
  if (needRefresh) return <button className="button" disabled={busy || !saved} title={saved ? 'Reload with the new version' : 'Save or export your draft before updating'} onClick={() => { void updateServiceWorker(true).catch(() => onError('Update failed. Reopen the app while online to retry.')); }}>Update app</button>;
  if (!install) return null;
  return <button className="button" onClick={() => { void install.prompt().then(() => setInstall(null)).catch(() => onError('Use your browser menu to install FiiOFixer.')); }}><Download size={15}/>Install</button>;
}
