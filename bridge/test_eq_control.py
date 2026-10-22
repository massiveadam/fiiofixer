"""Transaction failure tests; the real device experiment is documented separately."""
import unittest
from unittest.mock import Mock
from eq_control import READ_EQ, WRITE_ACK, ApplyError, StaleEqError, apply_eq
from test_enabled import EqSwitch


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
        self.switch = EqSwitch(True)

    async def exchange(self, frame):
        if self.drop:raise ConnectionError('Disconnected')
        if frame == READ_EQ:return self.eq
        if tuple(frame[4:6]) in ((3,1),(19,1)):
            return await self.switch.exchange(frame)
        self.writes.append(frame)
        first, last = frame[7:9]
        if not 0 <= first <= last <= 9 or len(frame) != 10+7*(last-first+1):raise AssertionError('Invalid band range')
        at, end = 9+first*7, 9+(last+1)*7
        self.eq = self.eq[:at]+frame[9:-1]+self.eq[end:]
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

    async def test_writes_one_complete_curve_after_saving_backup(self):
        device = Headphones()
        backup = Mock(side_effect=lambda _: self.assertEqual(device.writes, []))
        result = await apply_eq(device.exchange, baseline(), self.target(), backup)
        backup.assert_called_once_with(baseline())
        self.assertEqual(result, self.target())
        self.assertEqual(len(device.writes),1)
        self.assertEqual(device.writes[0][:9],bytes.fromhex('f1100050130d010009'))
        self.assertEqual(device.writes[0][9:],self.target()[9:])

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

    async def test_readback_mismatch_restores_the_original_curve(self):
        device = Headphones();device.bad_readback = True
        target = bytearray(self.target());target[9:11] = (-10).to_bytes(2,'big',signed=True)
        with self.assertRaisesRegex(ApplyError, 'Original EQ restored and verified'):
            await apply_eq(device.exchange, baseline(), bytes(target), Mock())
        self.assertEqual(device.eq, baseline())
        self.assertEqual([tuple(frame[7:9]) for frame in device.writes], [(0,9),(0,9)])

    async def test_disconnect_reports_that_restoration_could_not_be_verified(self):
        device = Headphones()
        async def exchange(frame):
            reply = await device.exchange(frame)
            if tuple(frame[4:6]) == (19,13):device.drop = True
            return reply
        with self.assertRaisesRegex(ApplyError, 'could not be restored'):
            await apply_eq(exchange, baseline(), self.target(), Mock())

    async def test_distant_band_changes_are_sent_together(self):
        device = Headphones()
        target = bytearray(self.target()); target[9:11] = (-10).to_bytes(2,'big',signed=True)
        await apply_eq(device.exchange,baseline(),bytes(target),Mock())
        self.assertEqual(device.eq,bytes(target))
        self.assertEqual(len(device.writes),1)

    async def test_apply_activates_eq_even_if_filter_bytes_already_match(self):
        device = Headphones();device.switch.enabled = False
        backup = Mock()
        self.assertEqual(await apply_eq(device.exchange, baseline(), baseline(), backup),baseline())
        self.assertTrue(device.switch.enabled)
        self.assertEqual(device.writes,[])
        backup.assert_called_once_with(baseline())

    async def test_apply_enables_eq_after_new_filters_are_verified(self):
        device = Headphones();device.switch.enabled = False
        await apply_eq(device.exchange,baseline(),self.target(),Mock())
        self.assertEqual(device.eq,self.target())
        self.assertTrue(device.switch.enabled)

    async def test_activation_failure_restores_filter_bytes_and_original_bypass(self):
        device = Headphones();device.switch.enabled = False;device.switch.bad_ack = True
        with self.assertRaisesRegex(ApplyError,'Original EQ restored and verified'):
            await apply_eq(device.exchange,baseline(),self.target(),Mock())
        self.assertEqual(device.eq,baseline())
        self.assertFalse(device.switch.enabled)

    async def test_broken_switch_restore_still_restores_the_original_curve(self):
        device = Headphones();device.switch.enabled = False
        async def exchange(frame):
            if tuple(frame[4:6]) == (3,1) and device.switch.writes:
                raise ConnectionError('Switch replies unavailable')
            reply = await device.exchange(frame)
            if tuple(frame[4:6]) == (19,1):
                raise ConnectionError('Switch replies unavailable')
            return reply
        with self.assertRaisesRegex(ApplyError, 'could not be restored'):
            await apply_eq(exchange,baseline(),self.target(),Mock())
        self.assertEqual(device.eq,baseline())
        self.assertEqual(len(device.writes),2)


if __name__ == '__main__':unittest.main()
