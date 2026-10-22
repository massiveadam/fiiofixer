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
8. Toggle the bat button in the top-right corner using both a click and keyboard Enter. Dracula mode must change artwork, headings, controls, graph colors, dialogs, favicon and browser theme color. Compare draft values, selected band, saved presets and curve geometry before and after switching both ways. Reload in Dracula mode and confirm the theme and draft restore. At 360 px, confirm the moonlit banner, controls and import dialog fit without horizontal overflow.

## v0.7 Dracula appearance and bat swarm animation

The production build was checked at 1280 px and 360 px. The vampire portrait, castle banner, bat icons, gothic headings, crimson graph and themed import dialog rendered correctly. The phone layout and dialog fit without horizontal overflow. Switching both ways preserved all non-theme local storage, numeric controls, preset name and graph paths. Reload preserved the theme and draft. Keyboard Enter toggled the button and its pressed state with visible focus. The light favicon restored and the dark browser theme color matched the canvas.

When toggling to Dracula mode, a bat swarm animation triggers across the screen with 20 bats featuring staggered trajectories, individual wing-beating cycles, crimson glow dropshadows, and automatic DOM unmounting after the 3-second flight. Prefers-reduced-motion queries and CSS rules disable the swarm when requested.

All 52 TypeScript tests, 49 Python tests and the production build passed. This pass changes appearance and animations only and includes no new hardware verification.

## Linux package

Run `npm run package:linux`. Extract the archive into a fresh directory, then install using `bash scripts/install-linux.sh --prefix '/tmp/fiiofixer-check/install prefix' --no-service`. Run the installed `bin/fiiofixer --no-browser` and check that `/api/status` identifies `fiiofixer`, version `0.5.1`, and `hardwareWritesEnabled: true`. Never store the response token in evidence.

Repeat installation to check that updates are safe. Test a regular per-user install with systemd and check that the service is enabled and active. Stop only helper processes created by your verification. The app must still start when the extracted release directory is no longer present.

## Hardware

Linux EH11 read/write experiments are recorded below. Remaining checks are Q semantics against FiiO Control, Android connection/writes, acoustic filter behavior, power-cycle persistence and switching playback devices. Use [the capture guide](hardware-capture.md) for the remaining evidence.

## v0.2 verification results

Verified on Linux with Node 24 and Python 3.12. The editor loaded with its HTTP server stopped, restored an imported draft after reload, and transferred a full preset library between separate localhost/127.0.0.1 origins. A repeated restore added no duplicates. A fresh extracted Linux package installed under a path containing spaces and started its own helper. The narrow layout had document width equal to its 360 px viewport.

The kernel adapter was present, but BlueZ was unavailable. No hardware read, write, Android connection or power-cycle persistence is claimed.

The v0.2 release passed 30 TypeScript tests and 10 Python helper tests. A normal per-user installation created an app-menu launcher and an enabled, active user service. Reinstalling with `--no-service` disabled and stopped that service; reinstalling normally enabled it again. The browser update prompt was exercised with a saved draft, and deletion undo restored the removed preset.

## v0.3 hardware verification

On 2026-10-22 the patched installed helper found a paired non-advertising EH11, opened its LE control connection alongside audio, and retained the session through three full EQ reads. Controlled writes tested band-10 gain, frequency, raw Q and shelf bytes, plus band-1 indexing/gain. Every test required the exact write ACK and complete expected readback; all tests restored the original 80-byte EQ. See [protocol evidence](protocol.md) for the limits of those results.

Automated failure tests cover stale baselines, backup failures, missing ACKs after an accepted write, readback mismatches, stopping later writes, verified restoration and a disconnect that prevents restoration. UI tests cover target precision and rejection of unsupported hardware settings. These tests supplement the physical experiments; they do not establish Q semantics, acoustic response, Android writes or power-cycle persistence.

The installed v0.3 UI then performed Connect → Read EQ → band-10 -1 dB → Apply. The returned full EQ differed only in the intended gain bytes. Previous EQ → Apply restored all 80 original bytes. The helper retained its connection throughout both transactions. The production build and 33 TypeScript plus 24 Python tests passed.

## v0.4 checks

Verify connection with a pre-existing local draft: the editor must load the headphone EQ, and Undo must recover the prior values. Verify ±12 dB numeric/slider/graph limits while preserving an imported out-of-range preset unchanged until edited.

Start Live EQ, move a gain repeatedly, and compare final device readback against the latest draft. The editor must remain usable during an in-flight reply. Check that one original backup survives all live changes. Stop with edits pending; no queued write may start afterwards. Restore with Previous EQ and verify the full original EQ. A failed ACK/readback must stop the session and require a new explicit start. Reconnect/reload must leave Live EQ off.

On 2026-10-22, the installed Linux UI loaded actual EQ over an existing saved draft; Undo recovered that draft with zero hardware writes. Live mode accepted repeated temporary gain edits while the editor stayed enabled. Twenty rapid intermediate edits were coalesced, at most one apply request was in flight, and the last checked readback matched the final -2 dB target. Complete readback changed only the intended gain bytes. The starting browser backup stayed identical and the helper created exactly one backup for the live session. Previous EQ restored all original bytes. Turning live off immediately after another edit canceled that unsent target; a fresh final EQ read still matched the full starting EQ. The test connection was released. The original EQ here means the current device state at this session’s start, including any user changes made since earlier experiments.

The release passed 40 TypeScript and 27 Python tests plus the production build. Q semantics, acoustic response and flash/power-cycle behavior remain outside this verification.

## v0.5 audible verification

The user reported that stored/readback-verified filters did not affect sound. A read confirmed global EQ off. After verifying the actual nine-byte state-echo ACK and enabling global EQ, the user confirmed the effect of a temporary strong treble-cut curve. All filter values survived the switch unchanged. We then tested an 80-byte all-band update with exact ACK and complete readback; the user repeated the listening comparison and confirmed a direct switch, without a fade, rolling bands or a mute. Their pre-test filters were restored with one command and EQ left on.

Regression checks cover exact global status/ACK frames, rejection of the old speculative ACK, activation after matching or changed filters, rollback of the curve and original bypass state after activation failure, and live start backup/activation ordering. Complete-curve writes replace sequential band writes in transaction tests. These are in addition to the live queue, stale session and storage checks from earlier versions.

The v0.5 production build passed 41 TypeScript and 40 Python tests. The installed UI read and loaded actual EQ on connection, displayed the verified global state, switched EQ off, and re-enabled it with an unchanged Apply. Starting Live EQ from off enabled processing; a temporary -1 dB band edit matched the complete expected readback. Previous EQ restored every original byte with EQ still on. The app update retained its saved draft. Desktop and 360 px layouts were checked.

## v0.5.1 connection recovery

The installed helper reproduced `br-connection-busy` from the audio bearer before any EQ command. Normal app disconnect had called Bleak disconnect, which invokes the whole-device BlueZ Disconnect method. The helper now releases the browser connection/live IDs while keeping its physical client for reuse. Busy/InProgress connection replies trigger bounded readiness polling, and a stalled cached-characteristic read cannot consume the entire connection window. Authentication failures still stop immediately.

A stuck pending connection was canceled only after confirming this headset was disconnected and had no active FiiOFixer session. The control link then responded. The installed v0.5.1 helper passed three Connect → read full EQ and global state → Disconnect cycles. After each release, BlueZ still reported Connected and ServicesResolved, the audio transport remained present, and all EQ bytes were unchanged with EQ on. Previous session IDs returned 409. No EQ writes were sent. All 49 Python and 41 TypeScript tests passed, along with the production build.

The updated browser UI also scanned and connected to the idle helper link, automatically loaded headphone EQ with the global switch on, and disconnected successfully. A full read during that UI session matched the pre-test EQ backup exactly.

## v0.6 EQ-on comparison

Flat now means zero-gain peaking filters while global headphone EQ stays on. The user reports different base tuning when processing is disabled; this update does not use bypass for comparison. The original curve is saved locally for the same device before writes, then restored byte for byte.

The production browser UI was checked against a simulated helper on an isolated local origin. EQ → Flat → EQ kept global processing on, sent no off command, zeroed every gain, preserved the editor draft, and restored the original raw frame exactly. Reloading while Flat was active recovered the comparison; reconnect read the actual device EQ while preserving an edited saved draft, and EQ restored the saved curve. A storage failure prevented every comparison apply.

For a live race, the simulated helper held a -1 dB write while a newer -2 dB edit was queued. Flat waited for the accepted -1 dB write, canceled -2 dB, stopped the live session, and used that fresh -1 dB frame as the restore point. EQ restored -1 dB; the unsent -2 dB draft remained editable. Preset selection during live mode applied automatically, and Undo restored the prior curve. The 360 px layout fit without horizontal overflow.

All 49 TypeScript and 49 Python tests and the production build passed. These v0.6 browser checks are simulations, not new acoustic measurements. The checked whole-curve and activation commands were physically verified in v0.5; the running v0.5.1 helper is compatible with this frontend. Updating the installed static frontend does not require a helper restart.

Review follow-ups verified that Apply and Live EQ started from Flat retain the pre-comparison original in Previous EQ. A quota failure sends no write and preserves the known processing state. The separate comparison matcher rejects another device or a changed hardware frame.

## v0.7.2 release and update path

The hosted site built from `main` was serving the new editor while the running Linux install was still `0.2.0`; the newest GitHub release was `0.6.0`. The version numbers had only ever been edited by hand, no workflow created releases, and the login service kept serving the old copied `dist`.

Checksums are now generated with the archive. Tag pushes run the same tests and packaging as `main`, then create a GitHub release with both assets; `main` still only deploys the Pages site. Verified on the real pipeline runs for `v0.7.0` and `v0.7.1`: build, deploy, and release all succeeded, and the published checksum matched the downloaded archive.

The editor now emits `version.json` with the package version and commit build ID. A client compares its own build ID with that file every minute and on focus, so a stale cached client can show **Update app** even when its service-worker registration never reaches `waiting`. Clicking it removes only this app's registration and caches, then reloads; GitHub Pages shares one origin, so other projects are untouched.

Tested by publishing a `version.json` with a different build ID against the local production bundle: the button appeared within one focus check, and clicking it replaced the old script with the new one. The same flow was repeated on the hosted site after `v0.7.1`: an old `index-Co6piRT8` client showed **Update app**, and clicking it loaded `index-HDpFxAmZ`. The local install then updated from `0.2.0` state through `fiiofixer-update` to `0.7.2`, reporting the running helper version each time and refusing to reinstall an equal version. An intentionally stale `0.7.0` updater run installed `0.6.0` because the published release was older than the local build; the comparison was corrected and the older-version cases now exit early.

## v0.7.2 bootstrap on a pre-updater install

A second Linux machine was still running `0.6.0`. Its `PwaControl` predates the `version.json` comparison, so it offers **Update app** only when a service worker reaches `waiting`; a local helper whose files never change never produces one, and `0.6.0` installs no `fiiofixer-update`. The button and the command therefore could not appear, no matter how many times the app was reloaded.

Bootstrapped once from the published `v0.7.2` archive: downloaded `fiiofixer-0.7.2-linux.tar.gz` and its `.sha256`, verified the checksum, then ran `scripts/install-linux.sh`. The login service restarted, `/api/status` and `/version.json` both report `0.7.2`, the bundle and `version.json` share the same build ID, and `fiiofixer-update` reports "Nothing newer to install." The 0.7.2 editor was loaded through a loopback tunnel, showed Connect, and raised no false update prompt.

Any install older than `0.7.0` needs this one-time installer run; those builds cannot see or run the updater. No hardware read or write was attempted during this check.

## Dracula cinematic switch and sound

Switching to the Dracula theme is now a short cinematic. The screen darkens, a synthesized pipe organ and the recorded "I Am Dracula" voice begin, the laugh follows, then the bat swarm crosses the screen with recorded bat chirps while the editor is revealed. A speaker toggle beside the theme switch mutes the effect, and the sound is routed to a chosen output device so it does not play through the EH11.

The pipe organ, the fallback laugh and the fallback bat chirps are synthesized in the browser with the Web Audio API. The recorded clips in `public/sounds/` are used when present: `i-am-dracula.mp3`, `maniacal-laugh.mp3` and `bat-chirping.mp3` (a 3.2 s excerpt). The hosted build falls back to synthesized audio if the clips are absent. Their licences restrict redistribution; that was accepted for this project and is noted in `public/sounds/README.md`.

Verified in Chromium at 1280x800: the sequence set its intro state, rendered 56 bats, hid the editor behind the lights-out overlay, then revealed it. The Web Audio graph loaded all three clips and scheduled the organ and voice at 0.3 s, the laugh at 3.5 s and the bat chirps at 4.6 s, with the audio context running. Visual review confirmed the settled theme keeps the editor readable, the top-bar drips stay clear of headings and buttons, and the bats read as clean silhouettes. 55 TypeScript and 50 Python tests pass and the production build succeeds. The animation respects `prefers-reduced-motion` by skipping the sequence entirely.
