# EH11 protocol evidence

Reviewed on 2026-10-22 against [jeromeof/devicePEQ](https://github.com/jeromeof/devicePEQ), audited upstream revision `0617f38`.

Primary references:

- [Current BLE handler](https://github.com/jeromeof/devicePEQ/blob/0617f38/devicePEQ/fiioBleHandler.js)
- [GATT configuration](https://github.com/jeromeof/devicePEQ/blob/0617f38/devicePEQ/bluetoothBleDeviceConfig.js)
- [Capture notes](https://github.com/jeromeof/devicePEQ/blob/0617f38/bluetooth_tools/cli_tools/FIIO_EH11_BLE_PROTOCOL.md)
- [EH13 synthetic capture](https://github.com/jeromeof/devicePEQ/blob/0617f38/tests/captures/fiio_eh13_ble.json)
- [FiiO EH11 controller specification](https://www.fiio.com/newsinfo/1113098.html)

The upstream work is credited to Jerome O'Flaherty / Pragmatic Audio and published under 0BSD. FiiOFixer independently implements the framing and read path. It does not assume that the EH11's JieLi chip uses a generic JieLi SDK protocol.

## Consistent read evidence

Service: `00001100-04a5-1000-1000-40ed981a04a5`

Write/query characteristic: `00001101-04a5-1000-1000-40ed981a04a5`

Notify characteristic: `00001102-04a5-1000-1000-40ed981a04a5`

Frame: `F1 10 <total length u16 big endian> <command byte 1> <command byte 2> <payload> FF`

Read protocol version: `F1 10 00 08 00 02 01 FF`

Read all EQ bands: `F1 10 00 0A 03 0D 01 00 09 FF`

The complete EQ response is 80 bytes. Nine header bytes precede ten seven-byte records. Each record has signed big-endian gain/10, unsigned frequency Hz, unsigned raw Q, and one filter-type byte. Raw replies are retained for diagnostics. Frames use their length field, since `FF` may occur in the payload. Unknown types are rejected rather than rewritten as peaking filters.

This repository has not yet read a real EH11. Consistency among reference materials is not hardware verification.

## Unresolved write and Q evidence

The handler interprets Q as raw/100 and writes a whole band using `13 0D`, repeated band index, then gain/frequency/Q/type. The older notes say raw/10 and describe the same packet area as groups of three gains. An example `00 55 00 C8 00 50 00` can be read either as three numbers or, plausibly, gain 8.5 dB, frequency 200 Hz, raw Q 80, type 0. The old prose alone does not settle its meaning. Dividing 80 by 100 gives the familiar Q of 0.8, but plausibility is not proof.

The upstream capture fixture explicitly describes itself as synthetic, and its write payload is wildcarded. Sending ten packets in a mock test does not establish a real device's command semantics. The audit therefore leaves **both the Q interpretation and hardware write implementation unverified**, rather than declaring either interpretation proven.

FiiOFixer sends no `13 0D`, EQ-toggle or save-to-flash command. Its TypeScript transports reject all commands outside a read allowlist, and its Linux helper validates exact read query payloads. A future writer needs independent captured fixtures for gain, frequency, Q and type changes, plus checked ACKs, readback and disconnect/partial-write behavior.

The reader cannot establish individual filter enable state or global preamp. Read bands are displayed as enabled for the local preview; this is not a claim that those flags were read from hardware. Local imported ON/OFF and preamp settings are preserved separately for future mapping.

## Squig.link source check

The live [Squig.link](https://squig.link/) [graphtool.js](https://squig.link/graphtool.js) exporter was inspected on 2026-10-22. Its `appendExportFilterLines` emits `Preamp: … dB`, `Filter N: ON/OFF TYPE Fc … Hz Gain … dB Q …` and maps internal `LSQ`/`HSQ` to `LSC`/`HSC`. It preserves gain to four decimals and Q to six. The importer accepts those fields without changing their precision or discarding disabled filters. Stereo channel exports are explicitly rejected because their mapping to EH11 hardware is unknown.
