# First EH11 capture

The goal is to replace conflicting reference assumptions with bytes from the official app talking to your EH11. Linux band writes have now been tested directly on a real EH11. This guide remains the path for settling Q semantics, acoustic filter mapping, unsupported controls and power-cycle persistence. See [protocol evidence](protocol.md) for completed tests.

## First read

1. Record the EH11 firmware version and all ten frequency/gain/Q/filter-type values shown in FiiO Control.
2. Close FiiO Control. In FiiOFixer connect through Linux BlueZ or Android Chrome.
3. Read the EQ and download diagnostics. Compare the frequency/gain/type values against the official app.
4. In FiiOFixer's diagnostics compare `raw ÷ 100` and `raw ÷ 10` Q interpretations. Record which matches the official app. The raw bytes remain unchanged.

## Capture official-app changes on Android

Android documents full HCI logging in [Verify and debug Bluetooth](https://source.android.com/docs/core/connect/bluetooth/verifying_debugging), with device setup in [Developer options](https://developer.android.com/studio/debug/dev-options).

1. Disconnect FiiOFixer so only FiiO Control is controlling the EH11.
2. Enable Developer options and **Enable Bluetooth HCI snoop log** on Android. Select full logging if the phone offers levels. Restart Bluetooth as Android documents.
3. Connect FiiO Control to the EH11. Record the original values and the time of each action.
4. Change one band gain by a small cut, such as -1 dB, and restore it. Then separately change its frequency and restore it. Repeat for Q and filter type. Include a second band to reveal indexing. Do not combine parameter changes in one step.
5. With USB debugging authorized and `adb` available, save a bug report:

   ```bash
   mkdir -p evidence/hardware
   adb bugreport evidence/hardware/eh11-capture.zip
   ```

6. Look for `btsnoop_hci.log` under the bug report's Bluetooth log files. OEMs differ in which files they include. Android also documents extracting in-memory snoop logs using its `btsnooz.py` utility, though filtered logs may omit the control payloads we need. A missing full capture is a capture gap, not proof of a protocol.
7. Inspect the log in Wireshark. Match GATT writes to the `1101` characteristic and notifications from `1102`. Compare complete length-framed `F1 10 … FF` messages against the action times.

Keep a minimal relevant packet extract rather than sharing a whole phone bug report, which can include unrelated device and account information. Disable HCI logging again after collecting the data.

## Evidence needed before a writer

- Original app values and corresponding raw EQ read.
- A known gain change and its exact write/ACK/readback.
- Separate frequency, Q and filter-type changes.
- Band indexing, supported ranges and rounding rules.
- Global preamp and enable commands only if actually observed.
- Whether changes survive power off/on and playing from another device.

Retain the capture as an unmodified fixture with firmware, Android/app version, expected before/after values, and a clear provenance note. Test a future writer against that fixture and then the real EH11.
