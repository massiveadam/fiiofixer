import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const packages = ['react', 'react-dom', 'scheduler', 'lucide-react', '@fontsource-variable/manrope', '@fontsource/ibm-plex-mono', ...readdirSync('node_modules').filter(name => name.startsWith('workbox-'))];
let notices = '# Third-party notices\n\nFiiOFixer independently implements an EH11 read path informed by Jerome O\'Flaherty\'s DevicePEQ protocol research, published under 0BSD.\nSource: https://github.com/jeromeof/devicePEQ/blob/master/LICENSE.txt\n\nThe following packages supply code or assets to the distributed web app. Python dependencies installed separately retain the licenses included in their wheels.\n';
for (const name of packages) {
  const directory = join('node_modules', name);
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT'].map(file => join(directory, file)).find(existsSync);
  if (!license) throw new Error(`License missing for ${name}`);
  notices += `\n## ${name} ${pkg.version}\n\nLicense: ${pkg.license}\n\n` + readFileSync(license, 'utf8') + '\n';
}
writeFileSync('THIRD_PARTY_NOTICES.md', notices.trimEnd() + '\n');
writeFileSync('public/third-party-notices.txt', notices.trimEnd() + '\n');
