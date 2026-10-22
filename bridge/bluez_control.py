"""Select the LE control connection without changing pairing or adapter settings.

BlueZ Connect() initially selects a dual-mode headset's bonded audio bearer.
A second call, while an audio profile is connected, opens the other bearer.
Bleak skips that call when Device1.Connected is already true. Confirm the real
control characteristic is readable before handing the connection to Bleak.
"""
import asyncio
import re

from bleak.backends.device import BLEDevice
from dbus_fast import BusType, Message, MessageType
from dbus_fast.aio import MessageBus

SERVICE = '00001100-04a5-1000-1000-40ed981a04a5'
RX = '00001102-04a5-1000-1000-40ed981a04a5'


def checked(reply):
    if reply is None or reply.message_type == MessageType.ERROR:
        name = reply.error_name if reply else 'NoReply'
        detail = str(reply.body[0]) if reply and reply.body else 'No BlueZ reply'
        raise ConnectionError(f'{name}: {detail}')
    return reply


async def managed_objects(bus):
    reply = checked(await bus.call(Message(destination='org.bluez', path='/',
        interface='org.freedesktop.DBus.ObjectManager', member='GetManagedObjects')))
    return reply.body[0]


def device_from_properties(path, values):
    props = {key: value.value for key, value in values.items()}
    return BLEDevice(props['Address'], props.get('Name') or props.get('Alias'), {'path': path, 'props': props})


async def get_paired_eh11_devices():
    bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
    try:
        objects = await asyncio.wait_for(managed_objects(bus), 2)
        found = {}
        for path, interfaces in objects.items():
            values = interfaces.get('org.bluez.Device1')
            if not values:
                continue
            props = {key: value.value for key, value in values.items()}
            name = props.get('Name') or props.get('Alias') or ''
            if (props.get('Paired') or props.get('Connected')) and re.search(r'\bEH[- ]?11\b', name, re.I):
                device = device_from_properties(path, values)
                found[device.address] = device
        return found
    finally:
        bus.disconnect()


async def control_ready(bus, path, objects):
    services = {p for p, interfaces in objects.items() if p.startswith(path + '/')
                and 'org.bluez.GattService1' in interfaces
                and interfaces['org.bluez.GattService1']['UUID'].value == SERVICE}
    for char_path, interfaces in objects.items():
        char = interfaces.get('org.bluez.GattCharacteristic1')
        if not char or char['UUID'].value != RX or char['Service'].value not in services:
            continue
        # Services can remain cached after LE disconnects. A real GATT read is
        # the readiness check; Device1.Connected also includes audio-only links.
        reply = await bus.call(Message(destination='org.bluez', path=char_path,
            interface='org.bluez.GattCharacteristic1', member='ReadValue', signature='a{sv}', body=[{}]))
        if reply and reply.message_type == MessageType.METHOD_RETURN:
            return True
        if reply and reply.error_name not in ('org.bluez.Error.NotConnected', 'org.bluez.Error.InProgress', 'org.bluez.Error.Failed'):
            checked(reply)
    return False


async def establish_control(bus, path):
    objects = await managed_objects(bus)
    if await control_ready(bus, path, objects):
        return device_from_properties(path, objects[path]['org.bluez.Device1'])
    for _ in range(2):
        checked(await bus.call(Message(destination='org.bluez', path=path,
            interface='org.bluez.Device1', member='Connect')))
        for _ in range(8):
            objects = await managed_objects(bus)
            if await control_ready(bus, path, objects):
                return device_from_properties(path, objects[path]['org.bluez.Device1'])
            await asyncio.sleep(0.15)
    raise ConnectionError('EH11 audio connected, but its LE control connection did not respond. Turn the headphones off and on, then reconnect.')


async def prepare_eh11(device):
    bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
    try:
        return await asyncio.wait_for(establish_control(bus, device.details['path']), 12)
    except TimeoutError as error:
        raise ConnectionError('EH11 control connection timed out. Turn the headphones off and on, then reconnect.') from error
    finally:
        bus.disconnect()
