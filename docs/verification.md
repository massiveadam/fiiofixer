# Verification

## Automated

Run `npm test`, `npm run build`, and `npm run test:bridge`. See the README for Python environment setup. Tests cover EQ parsing and curves, Bluetooth framing and timeouts, helper access boundaries, browser data migration, library merge/validation, and exact preservation of preamp, Q and disabled filters.

The Bluetooth fixtures are synthetic. Passing tests does not certify EH11 behavior.

## Browser

Use the production build at http://localhost:8787 or the hosted app.

1. Import Squig.link text with nonzero preamp, PK/LSC/HSC, precise decimal Q values and an OFF filter. Confirm numeric controls, ON/OFF state and export text match.
2. Change a value and reload. The draft and selected band must restore; Bluetooth must stay disconnected.
3. Save a preset, download a Library backup, and restore it in a second browser or origin. Compare every band and preamp. Restore again; there must be no duplicate. An invalid backup must leave the library unchanged.
4. In demo mode change a band and Apply in demo. Require `Demo verified`. Undo/redo must work for numeric changes, preamp and ON/OFF. Reading must preserve an edited draft. Disconnect must preserve the draft and disable hardware apply.
5. Wait for the service worker to activate, reload once, then stop the local helper and reload again. The editor must load from cache, retain the draft, and allow local editing. API calls must fail rather than return a cached token or device reply. Restart the helper afterwards.
6. Inspect at 1280×1000 and 360×800. The document and dialogs must fit the viewport. Check keyboard graph edits and visible focus.
7. On GitHub Pages, verify that manifest, icons, licenses and service worker resolve under `/fiiofixer/`. The hosted Connect dialog must offer browser Bluetooth and link to the Linux package instead of calling a local helper.

## Linux package

Run `npm run package:linux`. Extract the archive into a fresh directory, then install using `bash scripts/install-linux.sh --prefix '/tmp/fiiofixer-check/install prefix' --no-service`. Run the installed `bin/fiiofixer --no-browser` and check that `/api/status` identifies `fiiofixer`, version `0.2.0`, and `hardwareWritesEnabled: false`. Never store the response token in evidence.

Repeat installation to check that updates are safe. Test a regular per-user install with systemd and check that the service is enabled and active. Stop only helper processes created by your verification. The app must still start when the extracted release directory is no longer present.

## Hardware

Physical Android and EH11 testing are still required. Use [the capture guide](hardware-capture.md) before implementing writes. Confirm reads against FiiO Control, settle Q scaling, and capture real write/ACK/readback bytes. Then test power-cycle persistence and switching playback devices.

## v0.2 verification results

Verified on Linux with Node 24 and Python 3.12. The editor loaded with its HTTP server stopped, restored an imported draft after reload, and transferred a full preset library between separate localhost/127.0.0.1 origins. A repeated restore added no duplicates. A fresh extracted Linux package installed under a path containing spaces and started its own helper. The narrow layout had document width equal to its 360 px viewport.

The kernel adapter was present, but BlueZ was unavailable. No hardware read, write, Android connection or power-cycle persistence is claimed.

The v0.2 release passed 30 TypeScript tests and 10 Python helper tests. A normal per-user installation created an app-menu launcher and an enabled, active user service. Reinstalling with `--no-service` disabled and stopped that service; reinstalling normally enabled it again. The browser update prompt was exercised with a saved draft, and deletion undo restored the removed preset.
