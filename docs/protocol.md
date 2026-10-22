# EH11 protocol evidence

Reviewed on 2026-10-22 against [jeromeof/devicePEQ](https://github.com/jeromeof/devicePEQ), audited upstream revision `0617f38`.

Primary references:

- [Current BLE handler](https://github.com/jeromeof/devicePEQ/blob/0617f38/devicePEQ/fiioBleHandler.js)
- [GATT configuration](https://github.com/jeromeof/devicePEQ/blob/0617f38/devicePEQ/bluetoothBleDeviceConfig.js)
- [Capture notes](https://github.com/jeromeof/devicePEQ/blob/0617f38/bluetooth_tools/cli_tools/FIIO_EH11_BLE_PROTOCOL.md)
- [EH13 synthetic capture](https://github.com/jeromeof/devicePEQ/blob/0617f38/tests/captures/fiio_eh13_ble.json)
- [FiiO EH11 controller specification](https://www.fiio.com/newsinfo/1113098.html)

The upstream work is credited to Jerome O'Flaherty / Pragmatic Audio and published under 0BSD. FiiOFixer independently implements framing, reads and checked band writes. It does not assume that the EH11's JieLi chip uses a generic JieLi SDK protocol.

## Consistent read evidence

Service: `00001100-04a5-1000-1000-40ed981a04a5`

Write/query characteristic: `00001101-04a5-1000-1000-40ed981a04a5`

Notify characteristic: `00001102-04a5-1000-1000-40ed981a04a5`

Frame: `F1 10 <total length u16 big endian> <command byte 1> <command byte 2> <payload> FF`

Read protocol version: `F1 10 00 08 00 02 01 FF`

Read all EQ bands: `F1 10 00 0A 03 0D 01 00 09 FF`

The complete EQ response is 80 bytes. Nine header bytes precede ten seven-byte records. Each record has signed big-endian gain/10, unsigned frequency Hz, unsigned raw Q, and one filter-type byte. Raw replies are retained for diagnostics. Frames use their length field, since `FF` may occur in the payload. Unknown types are rejected rather than rewritten as peaking filters.

## Real EH11 experiments, 2026-10-22

On a paired EH11 through BlueZ 5.87, FiiOFixer read the protocol reply and complete 80-byte EQ. A controlled band-10 test sent a 1 dB cut, required the exact ACK `F1 10 00 08 13 0D 01 FF`, and compared the entire EQ against the expected result. Only the intended gain bytes changed. The original record was then written back and the entire 80-byte EQ matched the saved baseline.

Separate temporary tests changed frequency from 16000 to 15900 Hz, raw Q from 72 to 73, shelf type bytes 1 and 2, and band-1 gain from 12 to 11 dB. Each test required its ACK, exact full readback and full restoration before the next test. This independently confirms whole-band records and zero-based repeated indices at both ends of the band array. Personal EQ and device identifiers stay in private backups and are not shipped as fixtures.

Write frame: `F1 10 00 11 13 0D 01 <index> <index> <gain i16 BE> <frequency u16 BE> <raw Q u16 BE> <type> FF`.

These are packet/readback results. They do not measure acoustic response, prove the full supported ranges or establish flash persistence. Pass-filter writes were not tested and remain blocked. Linux apply uses a conservative ±12 dB limit. Android remains read-only until its real write path is tested.

## Checked writes

The Linux helper keeps `/api/exchange` restricted to exact read queries. `/api/apply` validates complete baseline and target frames, reads a fresh baseline, rejects stale state, and saves an exclusive private backup under `~/.local/share/fiiofixer/backups` before any write. If records changed, it sends the whole curve in one command. The ACK and complete readback must match exactly; global EQ activation is then checked. Failure attempts to restore the complete original curve and initial global enable state, including after a missing ACK. Restoration also requires exact full readback. A disconnect can prevent restoration; the app reports that separately and retains backups. It never retries an apply automatically.

The browser also stores the previous raw EQ before apply. **Previous EQ** loads it as a draft for explicit restoration. **Import EQ** also accepts the helper’s 80-byte `.bin` backups for recovery after browser data loss. Unsupported preamp, disabled bands, pass filters and out-of-range hardware gain fail before writes. Local presets retain their original precision; hardware apply rounds gain to 0.1 dB, frequency to whole Hz and Q to the selected raw unit.

## Unresolved Q scale

The current upstream handler uses raw/100; older notes use raw/10. The real experiments prove that raw Q writes round-trip unchanged. They do not prove which displayed Q matches FiiO Control or the acoustic filter. Diagnostics expose both interpretations, defaulting to the current upstream divisor of 100. An unchanged Q round-trips to its original raw bytes regardless of the selected interpretation. Compare against the official app before relying on a changed Q value.

Global EQ activation is now verified as described below. No preamp, per-filter bypass or save-to-flash command is sent.

The reader cannot establish individual filter enable state or global preamp. Read bands are displayed as enabled for the local preview; this is not a claim that those flags were read from hardware. Local imported ON/OFF and preamp settings are preserved separately for future mapping.

## Squig.link source check

The live [Squig.link](https://squig.link/) [graphtool.js](https://squig.link/graphtool.js) exporter was inspected on 2026-10-22. Its `appendExportFilterLines` emits `Preamp: … dB`, `Filter N: ON/OFF TYPE Fc … Hz Gain … dB Q …` and maps internal `LSQ`/`HSQ` to `LSC`/`HSC`. It preserves gain to four decimals and Q to six. The importer accepts those fields without changing their precision or discarding disabled filters. Stereo channel exports are explicitly rejected because their mapping to EH11 hardware is unknown.

## Live session protocol

Live EQ uses the verified complete-curve write command. `/api/live/start` requires a complete matching fresh baseline and saves one durable backup. The returned live ID is required on every live apply and cannot be reused after stop, connection loss or a failed transaction. `/api/live/stop` keeps the last verified EQ. It does not send an unverified save-to-flash command. Flash behavior during repeated updates remains unmeasured.

## v0.5 audible activation and whole-curve evidence

A real read returned `F1 10 00 09 03 01 01 00 FF`: filters were stored while global EQ was off. Sending `F1 10 00 09 13 01 01 01 FF` enabled EQ and returned that exact nine-byte packet as its ACK. A subsequent `03 01` read returned `F1 10 00 09 03 01 01 01 FF`. Disabling uses the same frame with the state byte zero, and its ACK echoes zero. Full filter bytes were unchanged by switching. The upstream eight-byte ACK is speculative and does not match this EH11.

The user audibly confirmed the effect using temporary deep high-shelf cuts. Their pre-test curve was backed up and restored, with EQ left enabled.

The two indices in a `13 0D` write are a start/end range. Real hardware accepted `F1 10 00 50 13 0D 01 00 09 <70 bytes of band records> FF`, returning `F1 10 00 08 13 0D 01 FF`. All ten returned records matched the target. The control MTU was 247, large enough for the entire 80-byte write. The user repeated an original-curve/treble-cut listening comparison and confirmed a direct switch with continuous audio. This proves the audible path on the tested headset, not a general acoustic measurement or power-cycle guarantee.

`/api/eq-enabled` accepts a strict boolean and current connection ID. It checks exact state-echo ACKs and actual `03 01` readback, restoring the initial switch on failure. The global switch is distinct from local per-filter ON/OFF metadata. Apply checks activation even when stored filter bytes already match. Live start backs up the curve before enabling EQ; a failed activation creates no live session.
