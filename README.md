# FiiOFixer

EQ editor for FiiO EH11 headphones. Import Squig.link filters, edit ten bands, and move presets between computers without an account.

**Hardware EQ writes are not available yet.** Bluetooth supports reads only. Q scaling and persistence on the headphones still need verification with a real EH11. Demo mode simulates applying and verifying EQ.

[Open the app](https://massiveadam.github.io/fiiofixer/) · [Download for Linux](https://github.com/massiveadam/fiiofixer/releases/latest)

## Web app

Open the app in Chrome. Use **Install app** or **Add to home screen** in the browser menu. The editor works offline after the first successful load. Bluetooth connections still need the appropriate browser/device support.

Android Chrome uses Web Bluetooth directly. On Linux, use the desktop package for Bluetooth through BlueZ. The hosted web app does not access a Linux helper across origins. Other browsers can use the editor and presets even when Bluetooth is unavailable.

## Linux installation

Requires Python 3.10+, Python venv/pip, a browser, and BlueZ for Bluetooth. Node is not needed for the release package. Installation downloads Python dependencies and uses no root permissions.

1. Download and extract `fiiofixer-*-linux.tar.gz` from Releases.
2. Open a terminal in the extracted directory and run:

   ```bash
   bash scripts/install-linux.sh
   ```

3. Open **FiiOFixer** from your app menu. It runs at **http://localhost:8787**.

The installer copies the app into `~/.local/share/fiiofixer`, adds a launcher at `~/.local/bin/fiiofixer`, and enables a user service when systemd is available. The helper then starts at login. Without systemd, the launcher starts it when needed. Bluetooth settings are never changed.

Install a newer release by running its installer again. The app keeps the same localhost address, so browser presets stay available. Quit an older manually started helper first if it occupies port 8787. Service logs are available with `journalctl --user -u fiiofixer`; launcher-started logs are in `~/.local/share/fiiofixer/helper.log`.

For an installation that starts only when opened, use `bash scripts/install-linux.sh --no-service` which also disables an existing FiiOFixer login service.

## Presets across computers

1. Save each EQ using **Save preset**.
2. Choose **Library backup**, then **Back up presets**.
3. On another computer or browser, choose **Library backup → Restore backup** and select the file.

Restore adds presets and keeps existing ones. Reimporting the same curves does not create duplicates. A backup includes every saved preset, preamp value, filter type, and ON/OFF state. It does not include an unsaved draft or Bluetooth connection.

Drafts also save automatically in the current browser. There is no account, analytics, or automatic cloud sync. Clearing site data removes that browser's drafts and presets. The hosted app and localhost app have separate storage; use a library backup to move between them. Existing Earform presets are migrated when FiiOFixer runs at the same browser origin.

## Squig.link

Import its parametric `Filters.txt` using **Import EQ**. Export offers compatible `.txt` and a single-preset JSON backup.

- Peaking filters use `PK`; shelves use `LSC` and `HSC`. Q precision is retained.
- Preamp and OFF filters are preserved. Preamp is not sent to headphones; the graph shows filters only.
- Up to ten filters. Separate left/right filters, shared measurement URLs, and graphic EQ exports are not supported.
- Local editing allows ±40 dB to retain imports. This is not an EH11 hardware limit.

## Development

Requires Node 22.12+ and Python 3.10+.

```bash
npm ci
npm run dev
```

For the production editor and Linux Bluetooth helper:

```bash
npm run linux
```

The helper binds to loopback only and serves the production editor at http://localhost:8787. Real Bluetooth requires a running BlueZ service. Close FiiO Control before connecting.

To test Android against a local build, connect by USB with debugging authorized, run `adb reverse tcp:8787 tcp:8787`, and open http://localhost:8787 in Android Chrome. A plain LAN HTTP address is not a secure context for Bluetooth.

```bash
npm run build
npm test
python3 -m venv .venv
.venv/bin/python -m pip install -r bridge/requirements-dev.txt
npm run test:bridge
npm run doctor
npm run package:linux
```

CI tests each push and pull request. Pushes to `main` deploy the HTTPS app through GitHub Pages. The Linux archive contains a prebuilt editor, the local reader, and installer scripts. It contains no virtual environment, account data, or hardware logs.

See [verification](docs/verification.md), [protocol evidence](docs/protocol.md), and [hardware capture steps](docs/hardware-capture.md).

## Credits

Independent project, not affiliated with FiiO. Protocol research by [Jerome O'Flaherty / DevicePEQ](https://github.com/jeromeof/devicePEQ), licensed 0BSD. FiiOFixer independently implements the read path. Fonts, icons, and library notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Project code is [MIT licensed](LICENSE).
