# FiiOFixer, EH11 prototype

## Choice

Two shapes were considered: separate native Android/Linux editors, or one browser editor with interchangeable Bluetooth transports. The shared browser editor wins for this prototype because EQ parsing, undo, presets, graphing, and readback verification have one implementation. Linux uses a loopback-only Python/Bleak helper through BlueZ. Android Chrome uses Web Bluetooth. A native Android app can adopt the transport contract later if browser connection management proves insufficient.

The design uses a cool blue work surface, white plotting paper, cobalt curve, and orange selected band inspired by the EH11 ear pads. Manrope handles text; IBM Plex Mono is reserved for actual numeric measurements. The graph is the primary control, with ten compact band selectors and one detailed band editor. Device and locally saved presets sit alongside it, stacking below the graph on phones. Avoid separate metric cards and decorative dashboards.

## Contracts and ownership

- `eq.ts` owns validated ten-band EQ state, supported filter types, imports, and curve calculations. Unknown device filters stop the read rather than silently changing them.
- `protocol.ts` owns packet framing and read decoding. Q is explicitly interpreted using either divisor 100 or divisor 10 because upstream evidence disagrees. No EQ-write encoder is included.
- `transport.ts` owns serialized request/reply pairing, notification framing, disconnect cleanup, and timeout invalidation. Each reply must match its command. No command flood or automatic write retries.
- Both real transports enforce confirmed read commands only. The Linux helper also validates exact read payloads. Timeout or connection loss closes that session. A future writer must touch only changed bands, require ACKs and exact full readback, and preserve a backup. That writer cannot be implemented from the conflicting reference alone.
- `App.tsx` owns the draft, history, local presets, and explicit user actions. Draft and device state remain distinct. Demo transport can never write real hardware.
- `bridge/server.py` exposes discovery, connection, and read-query exchange only on loopback. POST requests require a session token. Host/Origin checks reject cross-site access. A connection ID prevents stale tabs from closing a newer session. It serves `dist` for the Linux launch command.

## Limits

Readback proves the current device parameters, not acoustic response or persistence across power cycles. Apply/readback is currently implemented only in demo mode. The first hardware session must compare frequency/Q/type with FiiO Control before writing. EQ on/off and hardware preset switching are deliberately omitted because the reference marks their write commands unconfirmed. App presets live locally; they are not claims about hardware slots. Global preamp and per-filter ON/OFF values from Squig.link are preserved for editing and export, but no hardware mapping is claimed. Draft history includes preamp, and disabled filters retain their parameters while contributing zero to the graph.

Sources and provenance: see `docs/protocol.md`. Browser testing and the independent protocol audit do not replace an EH11 hardware test.

## Distribution and persistence

A shared installable web app plus a local Linux package was chosen over separate native apps. This keeps EQ parsing, presets and graph behavior identical across computers. GitHub Pages serves an HTTPS build under /fiiofixer/; the Linux package serves a root build on localhost:8787. Hosted pages never call a local helper across origins.

The PWA precaches public editor assets and fonts, never API responses or Bluetooth tokens. Updates require an explicit action and a successfully saved draft. No Bluetooth session is restored across reloads.

`storage.ts` owns draft validation, legacy Earform library migration and portable library backups. The original library key is retained. Restore validates the whole file before writing and merges by exact curve content with fresh local IDs. Browser origins remain separate. Users move data with backups; no account or automatic sync is introduced.

The visual palette keeps blue plotting lines and an orange selected band. Manrope carries controls; IBM Plex Mono is used for numbers. The graph is the main workspace. Promotional copy and the headphone illustration are removed; installation and protocol detail sit behind explicit controls.

Linux releases include a root-path production build, pinned reader requirements and a per-user installer. The installer copies public app files, creates an isolated venv and app-menu launcher, and enables a user service when available. Updates do not touch browser data or system Bluetooth settings.
