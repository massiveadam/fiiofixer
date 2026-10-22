import unittest
from eq_control import READ_ENABLED, ApplyError, read_enabled, set_enabled


class EqSwitch:
    def __init__(self, enabled=False):
        self.enabled = enabled
        self.writes = []
        self.bad_ack = False

    async def exchange(self, command):
        if command == READ_ENABLED:
            return bytes.fromhex('f1100009030101') + bytes([int(self.enabled), 255])
        if len(command) != 9 or command[:7] != bytes.fromhex('f1100009130101') or command[7] not in (0,1) or command[8] != 255:
            raise AssertionError('Unexpected switch command')
        self.writes.append(command)
        self.enabled = bool(command[7])
        if self.bad_ack:
            self.bad_ack = False
            return bytes.fromhex('f1100008130101ff')
        return command


class EnabledTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_requires_an_exact_boolean_status_frame(self):
        self.assertFalse(await read_enabled(EqSwitch().exchange))
        async def invalid(_):return bytes.fromhex('f110000903010102ff')
        with self.assertRaises(ApplyError):await read_enabled(invalid)

    async def test_enables_with_exact_ack_and_actual_state_readback(self):
        device = EqSwitch()
        self.assertTrue(await set_enabled(device.exchange, True))
        self.assertEqual(device.writes, [bytes.fromhex('f110000913010101ff')])
        self.assertTrue(device.enabled)

    async def test_does_not_rewrite_an_already_enabled_switch(self):
        device = EqSwitch(True)
        self.assertTrue(await set_enabled(device.exchange, True))
        self.assertEqual(device.writes, [])

    async def test_failed_ack_after_activation_restores_original_switch(self):
        device = EqSwitch();device.bad_ack = True
        with self.assertRaisesRegex(ApplyError, 'original state restored'):
            await set_enabled(device.exchange, True)
        self.assertFalse(device.enabled)
        self.assertEqual(device.writes, [bytes.fromhex('f110000913010101ff'),bytes.fromhex('f110000913010100ff')])


if __name__ == '__main__':unittest.main()
