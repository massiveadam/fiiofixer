# FiiOFixer

EQ editor for FiiO EH11 headphones. Import Squig.link filters, edit ten bands, and move presets between computers without an account.

Linux supports EQ writes with automatic backups, exact readback and verified headphone EQ activation. Gain, frequency, raw Q and shelf records were tested on a real EH11 and restored afterwards. Q scaling against FiiO Control and persistence after power off still need verification. Android Bluetooth remains read-only.

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
- Preamp and OFF filters are preserved. Hardware apply requires 0 dB preamp and enabled bands; bypass mapping is unverified. The graph shows filters only.
- Up to ten filters. Separate left/right filters, shared measurement URLs, and graphic EQ exports are not supported.
- Gain controls and graph edits use ±12 dB per band. Imports above that range are preserved for export and must be adjusted before applying. This is the app’s supported range, not proof of the firmware’s absolute limit. Peaking/shelf filters can be applied; pass filters stay local.

## Applying EQ on Linux

Connecting automatically reads the current headphone EQ into the editor. During a saved Flat comparison, it reads the device but keeps your draft. Disconnecting the app keeps the headset’s audio connection; the helper reuses its idle control link on the next connection. Undo recovers the draft that was open before connection. Edit and choose **Apply to headphones**. The helper checks the read baseline, saves a private backup, sends the whole curve in one command, verifies the complete readback, and enables headphone EQ. **EQ / Flat** compares your stored curve with zero-gain filters while headphone EQ stays enabled. The original curve is saved locally for that headset and restored exactly by **EQ**, including after reload. Flat stops Live EQ first and preserves your draft. The separate EQ processing switch is in Diagnostics. A failed check stops apply and attempts restoration. The app reports whether restoration was verified.

**Previous EQ** loads the backup as a draft. During a Flat comparison, this keeps the original curve rather than the temporary zero-gain filters. Choose **Apply to headphones** to restore it. Raw helper backups are also retained under `~/.local/share/fiiofixer/backups`. Open a `.bin` file with **Import EQ**, then Apply to restore it. With Live EQ off, changes are sent only when you press Apply.


Turn on **Live EQ** to hear edits while adjusting the graph or numeric controls. It starts off on every connection. Edits are coalesced at 150 ms with one complete-curve update in flight; newer edits replace pending slider positions. The controls remain editable while readback is pending. A failed check stops live mode without retrying automatically.

Turning Live EQ off cancels unsent edits, waits for the current write, and keeps the last heard EQ. **Previous EQ** retains the EQ from when live mode started. Loading it while live mode is on restores it after the next checked update. Clicking a preset also applies it while Live EQ is on. Live EQ enables headphone EQ after its starting backup is saved. The helper saves one backup per live session rather than one per slider movement. Curve changes use a single device command, keeping audio continuous and avoiding band-by-band transitions.

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

CI tests each push and pull request. Pushes to `main` deploy the HTTPS app through GitHub Pages. The Linux archive contains a prebuilt editor, the local Bluetooth helper, and installer scripts. It contains no virtual environment, account data, or hardware logs.

See [verification](docs/verification.md), [protocol evidence](docs/protocol.md), and [hardware capture steps](docs/hardware-capture.md).

## Credits

Independent project, not affiliated with FiiO. Protocol research by [Jerome O'Flaherty / DevicePEQ](https://github.com/jeromeof/devicePEQ), licensed 0BSD. FiiOFixer independently implements the control path. Fonts, icons, and library notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Project code is [MIT licensed](LICENSE).
