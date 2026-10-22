"""Open the installed local app and start its helper if needed."""
import argparse
import json
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
import webbrowser

parser = argparse.ArgumentParser(description='Open FiiOFixer')
parser.add_argument('--no-browser', action='store_true', help='Start and check the helper without opening a browser')
args = parser.parse_args()
app = Path(__file__).resolve().parents[1]
install = app.parent
url = 'http://localhost:8787'
def ready():
    try:
        with urlopen('http://127.0.0.1:8787/api/status', timeout=1) as response:
            data = json.load(response)
            if data.get('app') != 'fiiofixer':
                raise SystemExit('Port 8787 is in use by another app. Close it, then reopen FiiOFixer.')
            return True
    except HTTPError:
        raise SystemExit('Port 8787 is in use by another app. Close it, then reopen FiiOFixer.')
    except URLError:
        return False
    except (ValueError, AttributeError):
        raise SystemExit('Port 8787 is in use by another app. Close it, then reopen FiiOFixer.')
if not ready():
    with (install / 'helper.log').open('a') as log:
        process = subprocess.Popen([str(install / 'venv/bin/python'), str(app / 'bridge/server.py')], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(30):
        if ready():
            break
        if process.poll() is not None:
            raise SystemExit(f'Could not start FiiOFixer. See {install / "helper.log"}.')
        time.sleep(0.2)
    else:
        raise SystemExit(f'FiiOFixer did not start. See {install / "helper.log"}.')
if not args.no_browser:
    webbrowser.open(url)
print(url)
