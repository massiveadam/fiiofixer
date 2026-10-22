import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download } from 'lucide-react';

interface InstallPrompt extends Event { prompt(): Promise<void> }
function isInstallPrompt(event: Event): event is InstallPrompt {
  return 'prompt' in event && typeof event.prompt === 'function';
}

export function PwaControl({ busy, saved, onError }: { busy: boolean; saved: boolean; onError: (message: string) => void }) {
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError: () => onError('Offline setup failed. Reopen the app while online to retry.'),
  });
  useEffect(() => {
    const prompt = (event: Event): void => { if (isInstallPrompt(event)) { event.preventDefault(); setInstall(event); } };
    const installed = (): void => setInstall(null);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', prompt); window.removeEventListener('appinstalled', installed); };
  }, []);
  if (needRefresh) return <button className="button" disabled={busy || !saved} title={saved ? 'Reload with the new version' : 'Save or export your draft before updating'} onClick={() => { void updateServiceWorker(true).catch(() => onError('Update failed. Reopen the app while online to retry.')); }}>Update app</button>;
  if (!install) return null;
  return <button className="button" onClick={() => { void install.prompt().then(() => setInstall(null)).catch(() => onError('Use your browser menu to install FiiOFixer.')); }}><Download size={15}/>Install</button>;
}
