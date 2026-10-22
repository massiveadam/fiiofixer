# FiiOFixer, EH11 prototype

## Choice

Two shapes were considered: separate native Android/Linux editors, or one browser editor with interchangeable Bluetooth transports. The shared browser editor wins for this prototype because EQ parsing, undo, presets, graphing, and readback verification have one implementation. Linux uses a loopback-only Python/Bleak helper through BlueZ. Android Chrome uses Web Bluetooth. A native Android app can adopt the transport contract later if browser connection management proves insufficient.

The design uses a cool blue work surface, white plotting paper, cobalt curve, and orange selected band inspired by the EH11 ear pads. Manrope handles text; IBM Plex Mono is reserved for actual numeric measurements. The graph is the primary control, with ten compact band selectors and one detailed band editor. Device and locally saved presets sit alongside it, stacking below the graph on phones. Avoid separate metric cards and decorative dashboards.

## Contracts and ownership

- `eq.ts` owns validated ten-band EQ state, supported filter types, imports, and curve calculations. Unknown device filters stop the read rather than silently changing them.
- `protocol.ts` owns packet framing and read decoding. Q is explicitly interpreted using either divisor 100 or divisor 10 because upstream evidence disagrees. `hardware.ts` validates hardware settings and encodes a quantized target frame while keeping imported draft precision.
- `transport.ts` owns serialized request/reply pairing, notification framing, disconnect cleanup, and timeout invalidation. Each reply must match its command. No command flood or automatic write retries.
- Browser Bluetooth enforces read commands only. Linux keeps raw exchange read-only and exposes a separate checked apply transaction. `bridge/eq_control.py` owns fresh-baseline checks, durable backup, whole-curve writes, exact ACK/readback and rollback. No automatic apply retries.
- `App.tsx` owns the draft, history, local presets, and explicit user actions. Draft and device state remain distinct. Demo transport can never write real hardware.
- `bridge/server.py` exposes discovery, connection, read-query exchange and checked EQ apply only on loopback. POST requests require a session token. Host/Origin checks reject cross-site access. A connection ID prevents stale tabs from closing a newer session. It serves `dist` for the Linux launch command.

## Limits

Readback proves the current device parameters, not acoustic response or persistence across power cycles. Linux writes were tested on a real EH11 with full restoration. Q interpretation remains explicitly selectable and needs comparison with FiiO Control. Android writes remain disabled. EQ on/off and hardware preset switching are deliberately omitted because the reference marks their write commands unconfirmed. App presets live locally; they are not claims about hardware slots. Global preamp and per-filter ON/OFF values from Squig.link are preserved for editing and export, but no hardware mapping is claimed. Draft history includes preamp, and disabled filters retain their parameters while contributing zero to the graph.

Sources and provenance: see `docs/protocol.md`. Browser testing and the independent protocol audit do not replace an EH11 hardware test.

## Distribution and persistence

A shared installable web app plus a local Linux package was chosen over separate native apps. This keeps EQ parsing, presets and graph behavior identical across computers. GitHub Pages serves an HTTPS build under /fiiofixer/; the Linux package serves a root build on localhost:8787. Hosted pages never call a local helper across origins.

The PWA precaches public editor assets and fonts, never API responses or Bluetooth tokens. Updates require an explicit action and a successfully saved draft. No Bluetooth session is restored across reloads.

`storage.ts` owns draft validation, legacy Earform library migration and portable library backups. The original library key is retained. Restore validates the whole file before writing and merges by exact curve content with fresh local IDs. Browser origins remain separate. Users move data with backups; no account or automatic sync is introduced.

The visual palette keeps blue plotting lines and an orange selected band. Manrope carries controls; IBM Plex Mono is used for numbers. The graph is the main workspace. Promotional copy and the headphone illustration are removed; installation and protocol detail sit behind explicit controls.

Linux releases include a root-path production build, pinned reader requirements and a per-user installer. The installer copies public app files, creates an isolated venv and app-menu launcher, and enables a user service when available. Updates do not touch browser data or system Bluetooth settings.

`bridge/bluez_control.py` prepares the dual-mode connection through normal BlueZ Connect calls, checks a real GATT read rather than cached UUIDs, and discovers paired EH11s even when they are not advertising. It never pairs, removes devices or changes adapter settings.

## Live EQ

We compared repeatedly invoking manual Apply from a React effect with a helper-owned live session plus a dedicated client queue. The latter keeps the starting backup stable, bounds backup creation, and makes stale session ownership explicit. `LiveEqWriter` in `liveEq.ts` owns the newest pending raw target, one in-flight checked write and the last verified baseline. A 150 ms timer coalesces continuous movement without waiting for dragging to stop. Readback updates the device snapshot but never overwrites newer editor values. Stop cancels unsent targets and awaits the current write.

The helper creates a random live ID bound to its existing Bluetooth connection after reading and backing up the starting EQ. Apply must include the matching live ID while live mode is active. The transaction checks one complete-curve write ACK, full filter readback and the global EQ enable state; only repeated disk backups are skipped inside an already-backed-up live session. Failure invalidates that session. Manual Apply cannot bypass an active live session. Disconnect invalidates the connection and live ID. Live mode is never restored across page reloads; PWA updates are disabled while it is active.

Every initial connection reads and loads hardware EQ, with the previous draft in Undo history. Later manual Read EQ preserves the editor draft. Gain controls and graph movement are limited to ±12 dB; imported values outside that range remain intact for export and are rejected by hardware apply.

## Activation and complete-curve updates

The v0.4 experiments proved stored records but not audible processing. The user then reported unchanged audio; a real `03 01` query showed global EQ disabled. In v0.5, Apply and Live start ensure global activation, and connection/read paths display the actual switch state. The real `13 01` ACK is a nine-byte state echo, not the speculative eight-byte reply in the reference. Failure restores the initial global state and original filter curve when possible.

Real hardware accepted an 80-byte `13 0D` command with range 0 through 9 and all ten records. The user confirmed a direct audible switch with continuous audio. The helper now uses this complete-curve command for updates and rollback, rather than making successive band edits audible. It refuses a transport whose write capacity is below 80 bytes. It never mutes audio or bypasses EQ between normal updates. Firmware smoothing, if any, is outside the app’s control.

## Linux control session lifetime

The helper owns the physical GATT client for its lifetime; the browser owns only a revocable connection ID and live ID. Normal app disconnect and read-error cleanup release those IDs and clear queued replies, preserving the headset audio connection. A subsequent connection to the same EH11 reuses the idle client with a fresh random ID, then the frontend reads hardware EQ again. Stale IDs cannot access or disconnect a newer session. Helper shutdown still closes its physical client.

Keeping the helper client avoids invoking BlueZ Device1.Disconnect during routine app navigation. That call tears down every profile, including audio, and can race desktop auto-reconnect. Replacing Bleak with a custom D-Bus client was considered, but would broaden the change and duplicate notification and service handling. Busy and InProgress connect replies now lead to bounded readiness polling; authentication errors still fail immediately. Cached characteristic reads have their own timeout.
