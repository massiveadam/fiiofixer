"""EH11 band writes with a fresh baseline, durable backup and exact readback."""
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path
import tempfile

READ_EQ = bytes.fromhex('f110000a030d010009ff')
WRITE_ACK = bytes.fromhex('f1100008130d01ff')


class StaleEqError(ValueError):
    pass


class ApplyError(RuntimeError):
    pass


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
    changed = [i for i in range(10) if before[9+i*7:16+i*7] != target[9+i*7:16+i*7]]
    if not changed:
        return before
    backup(before)  # Failure to save a backup must prevent every hardware write.
    attempted = []
    expected = bytearray(before)

    async def restore():
        for index in reversed(attempted):
            at = 9+index*7
            if await exchange(band_write(index, before[at:at+7])) != WRITE_ACK:
                raise ApplyError('Restore acknowledgement did not match.')
        if await exchange(READ_EQ) != before:
            raise ApplyError('Restore readback did not match.')

    try:
        for index in changed:
            at = 9+index*7
            attempted.append(index)  # A missing ACK can still mean the write reached the device.
            if await exchange(band_write(index, target[at:at+7])) != WRITE_ACK:
                raise ApplyError(f'Band {index+1} acknowledgement did not match.')
            expected[at:at+7] = target[at:at+7]
            if await exchange(READ_EQ) != bytes(expected):
                raise ApplyError(f'Band {index+1} readback did not match. Apply stopped.')
        return bytes(expected)
    except (Exception, asyncio.CancelledError) as error:
        try:
            await asyncio.shield(restore())
        except Exception as restore_error:
            raise ApplyError('Apply failed and the original EQ could not be restored. Reconnect and restore the saved EQ backup.') from restore_error
        if isinstance(error, asyncio.CancelledError):
            raise
        raise ApplyError(f'Apply failed. Original EQ restored and verified. {error}') from error
