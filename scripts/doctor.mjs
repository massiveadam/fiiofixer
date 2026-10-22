import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

console.log(`FiiOFixer doctor • Node ${process.version} • ${process.platform}`);
for (const file of ['node_modules', 'src/App.tsx', 'bridge/server.py']) {
  console.log(`${existsSync(file) ? 'OK' : 'MISSING'} ${file}`);
}
console.log(`${existsSync('dist/index.html') ? 'OK' : 'NOT BUILT'} production editor`);
if (process.platform === 'linux') {
  const adapters = existsSync('/sys/class/bluetooth') ? readdirSync('/sys/class/bluetooth') : [];
  console.log(`Kernel Bluetooth adapters: ${adapters.join(', ') || 'none'}`);
  try { execFileSync('busctl', ['--system', '--no-pager', 'status', 'org.bluez'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] }); console.log('OK BlueZ service is available.'); }
  catch { console.log('UNAVAILABLE BlueZ service. The helper needs a Linux desktop with BlueZ running. UI and demo still work.'); }
}
try {
  const reply = await fetch('http://127.0.0.1:8787/api/status', { signal: AbortSignal.timeout(1000) });
  const data = await reply.json();
  console.log(data.app === 'fiiofixer' ? 'OK Linux helper available; hardware writes disabled.' : 'Port 8787 is serving another app.');
} catch { console.log('Linux helper not running. Start with npm run linux.'); }
console.log('Hardware EQ writes and power-cycle persistence remain unverified.');
