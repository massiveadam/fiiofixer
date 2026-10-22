"""Produce a Linux bundle from explicit public files; never copy local state."""
import hashlib
import json
from pathlib import Path
import tarfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
output = root / 'release' / f'fiiofixer-{version}-linux.tar.gz'
output.parent.mkdir(exist_ok=True)
paths = ['dist', 'bridge/server.py', 'bridge/bluez_control.py', 'bridge/eq_control.py', 'bridge/requirements.txt', 'scripts/install-linux.sh',
         'scripts/install-linux.py', 'scripts/launch-linux.py', 'scripts/update-linux.sh', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs']
with tarfile.open(output, 'w:gz') as archive:
    for relative in paths:
        path = root / relative
        if not path.exists():
            raise FileNotFoundError(path)
        archive.add(path, arcname=f'fiiofixer-{version}/{relative}')
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(output.parent / f'fiiofixer-{version}-linux.sha256').write_text(f'{digest}  {output.name}\n')
print(output)
