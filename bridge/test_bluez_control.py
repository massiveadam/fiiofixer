"""Simulate BlueZ bearer selection; no Bluetooth hardware is required."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from dbus_fast import MessageType, Variant
from bluez_control import SERVICE, RX, establish_control

DEVICE = '/org/bluez/hci0/dev_test'
SERVICE_PATH = DEVICE + '/service0001'


class DualModeBus:
    def __init__(self, state=0, cached=False):
        self.state = state
        self.cached = cached
        self.calls = []

    async def call(self, message):
        self.calls.append(message)
        if message.member == 'GetManagedObjects':
            objects = {DEVICE: {'org.bluez.Device1': {
                'Address': Variant('s', 'test-address'), 'Name': Variant('s', 'FIIO EH11'),
                'Connected': Variant('b', self.state > 0), 'Paired': Variant('b', True),
            }}}
            if self.state == 2 or self.cached:
                objects[SERVICE_PATH] = {'org.bluez.GattService1': {'UUID': Variant('s', SERVICE)}}
                objects[SERVICE_PATH + '/char0002'] = {'org.bluez.GattCharacteristic1': {
                    'UUID': Variant('s', RX), 'Service': Variant('o', SERVICE_PATH),
                }}
            return SimpleNamespace(message_type=MessageType.METHOD_RETURN, body=[objects])
        if message.member == 'Connect':
            self.state += 1
            return SimpleNamespace(message_type=MessageType.METHOD_RETURN, body=[])
        if message.member == 'ReadValue':
            if self.state == 2:
                return SimpleNamespace(message_type=MessageType.METHOD_RETURN, body=[b''])
            return SimpleNamespace(message_type=MessageType.ERROR, error_name='org.bluez.Error.NotConnected', body=['Not connected'])
        raise AssertionError(f'Unexpected BlueZ action: {message.member}')


class ControlTests(unittest.IsolatedAsyncioTestCase):
    async def test_audio_connection_does_not_count_as_control_ready(self):
        bus = DualModeBus()
        with patch('bluez_control.asyncio.sleep', new=AsyncMock()):
            device = await establish_control(bus, DEVICE)
        self.assertEqual(device.name, 'FIIO EH11')
        self.assertEqual([call.member for call in bus.calls].count('Connect'), 2)
        self.assertTrue(all(call.member not in ['Pair', 'Disconnect', 'RemoveDevice'] for call in bus.calls))

    async def test_cached_services_on_an_audio_only_connection_are_not_enough(self):
        bus = DualModeBus(state=1, cached=True)
        with patch('bluez_control.asyncio.sleep', new=AsyncMock()):
            await establish_control(bus, DEVICE)
        self.assertEqual([call.member for call in bus.calls].count('Connect'), 1)
        self.assertEqual(bus.state, 2)

    async def test_active_control_connection_is_reused_without_toggling_bluetooth(self):
        bus = DualModeBus(state=2)
        await establish_control(bus, DEVICE)
        self.assertEqual([call.member for call in bus.calls], ['GetManagedObjects', 'ReadValue'])
