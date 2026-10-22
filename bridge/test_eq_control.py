"""Transaction failure tests; the real device experiment is documented separately."""
import unittest
from unittest.mock import Mock
from eq_control import READ_EQ, WRITE_ACK, ApplyError, StaleEqError, apply_eq


def baseline():
    record = bytes.fromhex('000003e8004800')
    return bytes.fromhex('f1100050030d010009') + record*10 + b'\xff'


class Headphones:
    def __init__(self):
        self.eq = baseline()
        self.writes = []
        self.bad_ack = False
        self.bad_readback = False
        self.drop = False

    async def exchange(self, frame):
        if self.drop:raise ConnectionError('Disconnected')
        if frame == READ_EQ:return self.eq
        self.writes.append(frame)
        index = frame[7]
        if frame[8] != index:raise AssertionError('Index must be repeated')
        at = 9+index*7
        self.eq = self.eq[:at]+frame[9:16]+self.eq[at+7:]
        if self.bad_readback:
            self.bad_readback = False
            self.eq = self.eq[:at]+bytes.fromhex('ffec')+self.eq[at+2:]
        if self.bad_ack:
            self.bad_ack = False
            return bytes.fromhex('f1100008130d00ff')
        return WRITE_ACK


class ApplyTests(unittest.IsolatedAsyncioTestCase):
    def target(self):
        result = bytearray(baseline())
        result[72:74] = (-10).to_bytes(2,'big',signed=True)
        return bytes(result)

    async def test_writes_only_changed_band_after_saving_backup(self):
        device = Headphones()
        backup = Mock(side_effect=lambda _: self.assertEqual(device.writes, []))
        result = await apply_eq(device.exchange, baseline(), self.target(), backup)
        backup.assert_called_once_with(baseline())
        self.assertEqual(result, self.target())
        self.assertEqual(device.writes, [bytes.fromhex('f1100011130d010909fff603e8004800ff')])

    async def test_stale_baseline_and_invalid_target_never_write(self):
        device = Headphones();device.eq = self.target()
        backup = Mock()
        with self.assertRaises(StaleEqError):await apply_eq(device.exchange, baseline(), self.target(), backup)
        invalid = bytearray(self.target());invalid[78] = 4
        with self.assertRaises(ValueError):await apply_eq(device.exchange, baseline(), bytes(invalid), backup)
        self.assertEqual(device.writes, [])
        backup.assert_not_called()

    async def test_backup_failure_prevents_every_write(self):
        device = Headphones()
        with self.assertRaises(OSError):
            await apply_eq(device.exchange, baseline(), self.target(), Mock(side_effect=OSError('Disk full')))
        self.assertEqual(device.writes, [])

    async def test_missing_ack_restores_a_write_that_already_reached_hardware(self):
        device = Headphones();device.bad_ack = True
        with self.assertRaisesRegex(ApplyError, 'Original EQ restored and verified'):
            await apply_eq(device.exchange, baseline(), self.target(), Mock())
        self.assertEqual(device.eq, baseline())
        self.assertEqual(len(device.writes), 2)

    async def test_readback_mismatch_stops_later_bands_and_restores_original(self):
        device = Headphones();device.bad_readback = True
        target = bytearray(self.target());target[9:11] = (-10).to_bytes(2,'big',signed=True)
        with self.assertRaisesRegex(ApplyError, 'Original EQ restored and verified'):
            await apply_eq(device.exchange, baseline(), bytes(target), Mock())
        self.assertEqual(device.eq, baseline())
        self.assertEqual([frame[7] for frame in device.writes], [0, 0])

    async def test_disconnect_reports_that_restoration_could_not_be_verified(self):
        device = Headphones()
        async def exchange(frame):
            reply = await device.exchange(frame)
            if frame != READ_EQ:device.drop = True
            return reply
        with self.assertRaisesRegex(ApplyError, 'could not be restored'):
            await apply_eq(exchange, baseline(), self.target(), Mock())

    async def test_second_band_failure_restores_both_attempted_bands_in_reverse(self):
        device = Headphones()
        target = bytearray(self.target()); target[9:11] = (-10).to_bytes(2,'big',signed=True)
        async def exchange(frame):
            if frame != READ_EQ and len(device.writes) == 1:device.bad_ack = True
            return await device.exchange(frame)
        with self.assertRaisesRegex(ApplyError, 'Original EQ restored and verified'):
            await apply_eq(exchange, baseline(), bytes(target), Mock())
        self.assertEqual(device.eq, baseline())
        self.assertEqual([frame[7] for frame in device.writes], [0, 9, 9, 0])


if __name__ == '__main__':unittest.main()
