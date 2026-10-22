"""EH11 band writes with a fresh baseline, durable backup and exact readback."""
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path
import tempfile

READ_EQ = bytes.fromhex('f110000a030d010009ff')
WRITE_ACK = bytes.fromhex('f1100008130d01ff')
READ_ENABLED = bytes.fromhex('f1100008030101ff')


class StaleEqError(ValueError):
    pass


class ApplyError(RuntimeError):
    pass


async def read_enabled(exchange):
    reply = await exchange(READ_ENABLED)
    if len(reply) != 9 or reply[:7] != bytes.fromhex('f1100009030101') or reply[7] not in (0, 1) or reply[8] != 255:
        raise ApplyError('EH11 returned an invalid EQ enable state.')
    return reply[7] == 1


async def set_enabled(exchange, enabled):
    before = await read_enabled(exchange)
    if before == enabled:
        return enabled
    command = bytes.fromhex('f1100009130101') + bytes([int(enabled), 255])
    try:
        reply = await exchange(command)
        if reply != command:
            raise ApplyError('EH11 EQ switch acknowledgement did not match.')
        if await read_enabled(exchange) != enabled:
            raise ApplyError('EH11 EQ switch did not reach the requested state.')
        return enabled
    except Exception as error:
        # A lost ACK can still mean activation reached hardware. Restore the
        # actual initial switch state before returning a failed operation.
        try:
            if await read_enabled(exchange) != before:
                restore = bytes.fromhex('f1100009130101') + bytes([int(before), 255])
                if await exchange(restore) != restore or await read_enabled(exchange) != before:
                    raise ApplyError('EQ switch restoration failed.')
        except Exception as restore_error:
            raise ApplyError('EQ switch failed and its original state could not be restored. Reconnect and check Headphone EQ.') from restore_error
        raise ApplyError(f'EQ switch failed; original state restored. {error}') from error


def validate_eq(data, writable=False):
    if len(data) != 80 or data[:9] != bytes.fromhex('f1100050030d010009') or data[-1] != 255:
        raise ValueError('Expected a complete ten-band EH11 EQ frame.')
    for i in range(10):
        record = data[9+i*7:16+i*7]
        gain = int.from_bytes(record[:2], 'big', signed=True)
        frequency = int.from_bytes(record[2:4], 'big')
        q = int.from_bytes(record[4:6], 'big')
        if not 20 <= frequency <= 20000 or not 1 <= q <= 10000 or not -400 <= gain <= 400 or record[6] > 4:
            raise ValueError(f'Invalid hardware values in band {i+1}.')
        if writable and (abs(gain) > 120 or record[6] > 2):
            raise ValueError('Hardware apply supports peaking and shelf filters within -12 to +12 dB.')


def band_write(index, record):
    return bytes.fromhex('f1100011130d01') + bytes([index, index]) + record + b'\xff'


def curve_write(eq):
    # The two indices are a range. One 80-byte command updates all ten records.
    command = bytearray(eq)
    command[4] = 0x13
    return bytes(command)


def save_backup(before):
    directory = Path.home() / '.local/share/fiiofixer/backups'
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-')
    # Exclusive creation and private permissions; no device address or session token.
    with tempfile.NamedTemporaryFile(prefix=stamp, suffix='-eq.bin', dir=directory, delete=False) as file:
        file.write(before)
        file.flush()
        os.fsync(file.fileno())


async def apply_eq(exchange, baseline, target, backup=save_backup):
    validate_eq(baseline)
    validate_eq(target, writable=True)
    before = await exchange(READ_EQ)
    validate_eq(before)
    if before != baseline:
        raise StaleEqError('Headphone EQ changed. Read EQ again before applying your draft.')
    enabled_before = await read_enabled(exchange)
    changed = [i for i in range(10) if before[9+i*7:16+i*7] != target[9+i*7:16+i*7]]
    if not changed and enabled_before:
        return before
    backup(before)  # Failure to save a backup must prevent every hardware write.
    async def restore():
        # If a transport rejects the packet before sending, there is nothing to rewrite.
        if await exchange(READ_EQ) != before:
            if await exchange(curve_write(before)) != WRITE_ACK:
                raise ApplyError('Restore acknowledgement did not match.')
        if await exchange(READ_EQ) != before:
            raise ApplyError('Restore readback did not match.')
        await set_enabled(exchange, enabled_before)
        if await read_enabled(exchange) != enabled_before:
            raise ApplyError('Restored EQ switch did not match.')

    try:
        if changed:
            if await exchange(curve_write(target)) != WRITE_ACK:
                raise ApplyError('EQ curve acknowledgement did not match.')
            if await exchange(READ_EQ) != target:
                raise ApplyError('Full EQ readback did not match. Apply stopped.')
        await set_enabled(exchange, True)
        return target
    except (Exception, asyncio.CancelledError) as error:
        try:
            await asyncio.shield(restore())
        except Exception as restore_error:
            raise ApplyError('Apply failed and the original EQ could not be restored. Reconnect and restore the saved EQ backup.') from restore_error
        if isinstance(error, asyncio.CancelledError):
            raise
        raise ApplyError(f'Apply failed. Original EQ restored and verified. {error}') from error
