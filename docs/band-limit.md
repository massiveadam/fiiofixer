# EH11 band limit

Research checked on 2026-10-22.

Ten bands is the only verified device-side count. FiiOFixer reads an 80-byte EQ frame with a range of 0 through 9 and ten seven-byte filter records. Readback and listening tests verified complete-curve writes for that range.

The independent [devicePEQ EH11 handler](https://github.com/jeromeof/devicePEQ/blob/0617f38/devicePEQ/fiioBleHandler.js) also implements ten bands. The project's [supported-device description](https://github.com/jeromeof/devicePEQ) describes one custom ten-band EH11/EH13 slot. These establish the implemented control path, not an absolute limit on the silicon.

FiiO identifies the controller as [JL7018](https://www.fiio.com/newsinfo/1113098.html). That chip name does not establish which DSP resources FiiO's firmware exposes. The published [EH11 firmware notes](https://bbs.fiio.com/phoneNote/showNoteContent.do?id=202603041422474137380&tid=16) reviewed here add EQ-state display and other changes, but do not describe extra bands.

No supported command, firmware option or independently verified EH11 capture exposing more than ten bands was found. Extra device-side bands would require additional firmware support or evidence of an undocumented control path. FiiOFixer does not send out-of-range band writes or flash modified firmware.

A computer-side audio processor can add filters before Bluetooth transmission, but those filters run on the source computer and do not become additional bands inside the EH11. Another possible future feature is approximating a larger filter set with ten bands; that would change the curve and require reporting the approximation error.

## Flat comparison

The user reports that enabling EQ changes the EH11's base tuning even with neutral filters. Consequently, Flat means zero-gain filters with global EQ still enabled. Disabling global EQ is a separate processing state. This distinction guides the A/B control; it is not an acoustic measurement of the headset.
