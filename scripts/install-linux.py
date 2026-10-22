"""Per-user Linux installation. Copies only app files, never browser presets."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description='Install FiiOFixer for the current Linux user.')
parser.add_argument('--prefix', type=Path, default=Path.home() / '.local', help='Installation prefix, default ~/.local; custom prefixes do not configure a login service')
parser.add_argument('--no-service', action='store_true', help='Start on launch rather than at login')
args = parser.parse_args()
if not sys.platform.startswith('linux') or sys.version_info < (3, 10):
    raise SystemExit('Requires Linux and Python 3.10 or newer.')
source = Path(__file__).resolve().parents[1]
if not (source / 'dist/index.html').is_file():
    raise SystemExit('Download the Linux release bundle, or run npm ci && npm run build first.')
class BuildPaths(HTMLParser):
    root_build = False
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'script' and values.get('type') == 'module' and values.get('src', '').startswith('/assets/'):
            self.root_build = True
paths = BuildPaths()
paths.feed((source / 'dist/index.html').read_text())
if not paths.root_build:
    raise SystemExit('The Linux package needs a root-path build. Run npm run build without --base, or use the Linux release bundle.')
prefix = args.prefix.expanduser().resolve()
install = prefix / 'share/fiiofixer'
app = install / 'app'
venv = install / 'venv'
install.mkdir(parents=True, exist_ok=True)
if app.exists() and not (install / 'installed.json').is_file():
    raise SystemExit(f'{app} already exists without an installation marker. Choose another --prefix.')
if not (venv / 'bin/python').is_file():
    subprocess.run([sys.executable, '-m', 'venv', str(venv)], check=True)
subprocess.run([str(venv / 'bin/python'), '-m', 'pip', 'install', '--disable-pip-version-check', '-r', str(source / 'bridge/requirements.txt')], check=True)
# Stop only our service before updating files. A manually started reader can finish.
unit_dir = Path.home() / '.config/systemd/user'
unit = unit_dir / 'fiiofixer.service'
service_available = prefix == (Path.home() / '.local').resolve() and shutil.which('systemctl') is not None and subprocess.run(['systemctl', '--user', 'show-environment'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
service = not args.no_service and service_available
if service_available and unit.exists():
    command = ['systemctl', '--user', 'disable', '--now', 'fiiofixer.service'] if args.no_service else ['systemctl', '--user', 'stop', 'fiiofixer.service']
    subprocess.run(command, check=True)
for relative in ['dist', 'bridge', 'scripts']:
    (app / relative).mkdir(parents=True, exist_ok=True)
shutil.copytree(source / 'dist', app / 'dist', dirs_exist_ok=True)
for relative in ['bridge/server.py', 'bridge/bluez_control.py', 'bridge/eq_control.py', 'bridge/requirements.txt', 'scripts/launch-linux.py', 'scripts/update-linux.sh']:
    shutil.copy2(source / relative, app / relative)
for relative in ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']:
    shutil.copy2(source / relative, app / relative)
(install / 'installed.json').write_text(json.dumps({'app': 'fiiofixer', 'format': 1}) + '\n')
bin_dir = prefix / 'bin'
bin_dir.mkdir(parents=True, exist_ok=True)
launcher = bin_dir / 'fiiofixer'
launcher.write_text('#!/usr/bin/env python3\nimport runpy\nrunpy.run_path(' + repr(str(app / 'scripts/launch-linux.py')) + ', run_name="__main__")\n')
launcher.chmod(0o755)
updater = bin_dir / 'fiiofixer-update'
updater.write_text('#!/usr/bin/env bash\nexec bash ' + shlex.quote(str(app / 'scripts/update-linux.sh')) + ' "$@"\n')
updater.chmod(0o755)
applications = prefix / 'share/applications'
applications.mkdir(parents=True, exist_ok=True)
def desktop_quote(path):
    return '"' + str(path).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"'
(applications / 'fiiofixer.desktop').write_text('[Desktop Entry]\nType=Application\nName=FiiOFixer\nComment=FiiO EH11 EQ editor\nExec=' + desktop_quote(launcher) + '\nIcon=' + str(app / 'dist/icon-192.png') + '\nTerminal=false\nCategories=AudioVideo;Audio;\n')
if service:
    def systemd_quote(path):
        return '"' + str(path).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'
    unit_dir.mkdir(parents=True, exist_ok=True)
    unit.write_text('[Unit]\nDescription=FiiOFixer local Bluetooth reader\nAfter=bluetooth.target\n\n[Service]\nType=simple\nExecStart=' + systemd_quote(venv / 'bin/python') + ' ' + systemd_quote(app / 'bridge/server.py') + '\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n')
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', 'fiiofixer.service'], check=True)
print(f'Installed FiiOFixer. Open it from your app menu or run {launcher}.')
print(f'Update later with {updater}.')
print('Starts at login.' if service else 'Bluetooth helper starts when you open the app.')
print('Presets stay in your browser. Use Library backup to move them.')
