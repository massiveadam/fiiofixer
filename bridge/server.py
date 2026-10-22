"""Loopback-only EH11 control with checked, backed-up EQ writes."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
import re
import secrets
import time
from urllib.parse import urlparse

from bleak import BleakClient, BleakScanner
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr
import uvicorn
from bluez_control import get_paired_eh11_devices, prepare_eh11
from eq_control import apply_eq, validate_eq, save_backup, READ_EQ, read_enabled, set_enabled, StaleEqError, ApplyError

logger = logging.getLogger('uvicorn.error')

SERVICE = "00001100-04a5-1000-1000-40ed981a04a5"
TX = "00001101-04a5-1000-1000-40ed981a04a5"
RX = "00001102-04a5-1000-1000-40ed981a04a5"
TOKEN = secrets.token_urlsafe(32)
ROOT = Path(__file__).resolve().parents[1]
DISCONNECT_TIMEOUT = 4
ALLOWED_HOSTS = {"localhost", "127.0.0.1", "::1"}
# Exact query payloads, not merely a high-nibble convention. No guessed writes.
READ_QUERIES = {
    (0x00, 0x02): bytes([1]),
    (0x00, 0x03): bytes([1]),
    (0x03, 0x01): bytes([1]),
    (0x03, 0x0D): bytes([1, 0, 9]),
    (0x08, 0x01): bytes([1]),
    (0x08, 0x02): bytes([1]),
}


def validate_query(data: bytes) -> tuple[int, int]:
    if len(data) < 7 or data[:2] != b"\xf1\x10" or int.from_bytes(data[2:4], "big") != len(data) or data[-1] != 0xFF:
        raise ValueError("Invalid FiiO frame.")
    command = (data[4], data[5])
    if READ_QUERIES.get(command) != data[6:-1]:
        raise ValueError("Raw exchange accepts confirmed read queries only. Use checked Apply for EQ writes.")
    return command


class Frames:
    def __init__(self):
        self.buffer = bytearray()

    def push(self, data: bytes) -> list[bytes]:
        self.buffer.extend(data)
        result = []
        while len(self.buffer) >= 4:
            if self.buffer[:2] != b"\xf1\x10":
                del self.buffer[0]
                continue
            size = int.from_bytes(self.buffer[2:4], "big")
            if size < 7 or size > 4096:
                del self.buffer[0]
                continue
            if len(self.buffer) < size:
                break
            frame = bytes(self.buffer[:size])
            del self.buffer[:size]
            if frame[-1] != 0xFF:
                raise ValueError("Invalid response terminator.")
            result.append(frame)
        return result


class Reader:
    def __init__(self):
        self.client: BleakClient | None = None
        self.connection_id: str | None = None
        self.live_id: str | None = None
        self.devices = {}
        self.lock = asyncio.Lock()
        self.queue: asyncio.Queue[bytes | Exception] = asyncio.Queue(maxsize=100)
        self.frames = Frames()

    def notify(self, _characteristic, data: bytearray):
        try:
            for frame in self.frames.push(bytes(data)):
                self.queue.put_nowait(frame)
        except (ValueError, asyncio.QueueFull) as error:
            while not self.queue.empty():
                self.queue.get_nowait()
            self.queue.put_nowait(error)

    def dropped(self, client):
        if self.client is client:
            logger.info('EH11 control connection disconnected.')
            self.connection_id = None
            self.live_id = None
            try:
                self.queue.put_nowait(ConnectionError("EH11 disconnected. Reconnect to continue."))
            except asyncio.QueueFull:
                pass

    async def close(self):
        client, self.client = self.client, None
        self.connection_id = None
        self.live_id = None
        if client and client.is_connected:
            try:
                await asyncio.wait_for(client.disconnect(), DISCONNECT_TIMEOUT)
            except Exception as error:
                logger.warning('EH11 disconnect cleanup did not complete: %s', error)
        self.queue = asyncio.Queue(maxsize=100)
        self.frames = Frames()

    def require(self, connection_id: str):
        if not self.client or not self.client.is_connected or self.connection_id != connection_id:
            raise HTTPException(409, "This Bluetooth session has ended. Reconnect your EH11.")

    async def exchange(self, data: bytes) -> bytes:
        validate_query(data)
        return await self.transact(data)

    async def transact(self, data: bytes) -> bytes:
        command = tuple(data[4:6])
        client = self.client
        if not client:
            raise ConnectionError("Connect the EH11 first.")
        # Discard notifications queued before this request. The protocol has no transaction ID.
        while not self.queue.empty():
            self.queue.get_nowait()
        self.frames = Frames()
        tx = client.services.get_characteristic(TX)
        if not tx:
            raise ValueError("EH11 write characteristic is missing.")
        if 'write-without-response' in tx.properties and len(data) > getattr(tx, 'max_write_without_response_size', 20):
            raise ValueError('EH11 Bluetooth packet size is too small for a whole EQ curve. Reconnect and try again.')
        await client.write_gatt_char(tx, data, response="write-without-response" not in tx.properties)
        deadline = time.monotonic() + 6
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("No EH11 reply after 6 seconds. Reconnect and try again.")
            reply = await asyncio.wait_for(self.queue.get(), timeout=remaining)
            if isinstance(reply, Exception):
                raise reply
            if tuple(reply[4:6]) == command:
                return reply


reader = Reader()


@asynccontextmanager
async def lifespan(_app):
    yield
    await reader.close()


app = FastAPI(title="FiiOFixer EH11 local control", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.middleware("http")
async def local_only(request: Request, call_next):
    if request.url.hostname not in ALLOWED_HOSTS:
        return JSONResponse({"detail": "Only loopback hosts are allowed."}, 403)
    origin = request.headers.get("origin")
    if origin:
        try:
            parsed = urlparse(origin)
            allowed = parsed.scheme == "http" and parsed.hostname in ALLOWED_HOSTS and parsed.port in {5173, 4173, 8787}
        except ValueError:
            allowed = False
        if not allowed:
            return JSONResponse({"detail": "Cross-site access is not allowed."}, 403)
    if request.url.path.startswith("/api/") and request.method != "GET":
        if not secrets.compare_digest(request.headers.get("x-fiiofixer-session", ""), TOKEN):
            return JSONResponse({"detail": "Session expired. Refresh FiiOFixer and try again."}, 403)
        if request.headers.get("content-type", "").split(";")[0].strip() != "application/json":
            return JSONResponse({"detail": "JSON request required."}, 415)
    return await call_next(request)


@app.get("/api/status")
async def status():
    return {"app": "fiiofixer", "version": "0.5.0", "token": TOKEN, "hardwareWritesEnabled": True, "liveEqEnabled": True, "eqSwitchEnabled": True,
            "connectionId": reader.connection_id if reader.client and reader.client.is_connected else None}


@app.post("/api/scan")
async def scan():
    async with reader.lock:
        if reader.client and reader.client.is_connected:
            raise HTTPException(409, "An EH11 is already connected. Disconnect it in the other tab first.")
        try:
            found = await BleakScanner.discover(timeout=7, return_adv=True)
            reader.devices = {**await get_paired_eh11_devices(), **{
                address: device for address, (device, adv) in found.items()
                if re.search(r"\bEH[- ]?11\b", adv.local_name or device.name or "", re.I)}}
            logger.info('EH11 discovery found %d device(s), including paired devices.', len(reader.devices))
            return [{"id": address, "name": device.name or "FiiO EH11"} for address, device in reader.devices.items()]
        except Exception as error:
            logger.warning('EH11 scan failed: %s: %s', type(error).__name__, error)
            if "org.bluez" in str(error) and "ServiceUnknown" in str(error):
                raise HTTPException(503, "Linux Bluetooth service (BlueZ) is unavailable on this machine. Run the helper on your Linux desktop with Bluetooth enabled.") from error
            raise HTTPException(503, f"Bluetooth scan failed: {error}. Check that your adapter is on.") from error


class ConnectBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: StrictStr = Field(max_length=200)


class SessionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connectionId: StrictStr = Field(max_length=100)


class ExchangeBody(SessionBody):
    bytes: list[StrictInt] = Field(min_length=7, max_length=64)


class ApplyBody(SessionBody):
    baseline: list[StrictInt] = Field(min_length=80, max_length=80)
    target: list[StrictInt] = Field(min_length=80, max_length=80)
    liveId: StrictStr | None = Field(default=None, max_length=100)


class LiveStartBody(SessionBody):
    baseline: list[StrictInt] = Field(min_length=80, max_length=80)


class LiveStopBody(SessionBody):
    liveId: StrictStr = Field(max_length=100)


class EnabledBody(SessionBody):
    enabled: StrictBool


@app.post("/api/connect")
async def connect(body: ConnectBody):
    async with reader.lock:
        if reader.client and reader.client.is_connected:
            raise HTTPException(409, "An EH11 is already connected. Disconnect it first.")
        device = reader.devices.get(body.id)
        if not device:
            raise HTTPException(400, "Choose an EH11 from a fresh scan.")
        await reader.close()
        try:
            async def establish():
                ready_device = await prepare_eh11(device)
                client = BleakClient(ready_device, disconnected_callback=reader.dropped, timeout=6)
                reader.client = client
                await client.connect()
                if not client.services.get_service(SERVICE):
                    raise ValueError('EH11 control services changed during connection. Reconnect and try again.')
                await client.start_notify(RX, reader.notify)
            await asyncio.wait_for(establish(), 17)
            reader.connection_id = secrets.token_urlsafe(16)
            logger.info('EH11 control connection ready; notifications enabled.')
            return {"connectionId": reader.connection_id}
        except Exception as error:
            logger.warning('EH11 control connection failed: %s: %s', type(error).__name__, error)
            await reader.close()
            detail = str(error) or 'Connection timed out. Turn the headphones off and on, then reconnect.'
            raise HTTPException(503, f'Could not connect to EH11: {detail}') from error


@app.post("/api/disconnect")
async def disconnect(body: SessionBody):
    async with reader.lock:
        # Repeated cleanup is harmless. A stale tab cannot disconnect a newer session.
        if reader.connection_id is not None and reader.connection_id != body.connectionId:
            raise HTTPException(409, "That session has already ended.")
        await reader.close()
        return {"disconnected": True}


@app.post("/api/exchange")
async def exchange(body: ExchangeBody):
    if any(byte < 0 or byte > 255 for byte in body.bytes):
        raise HTTPException(400, "Packet bytes must be between 0 and 255.")
    data = bytes(body.bytes)
    try:
        validate_query(data)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    async with reader.lock:
        reader.require(body.connectionId)
        try:
            reply = await reader.exchange(data)
            return {"bytes": list(reply)}
        except Exception as error:
            logger.warning('EH11 read failed: %s: %s', type(error).__name__, error)
            await reader.close()
            raise HTTPException(503, f"EH11 read failed: {error}. Reconnect before retrying.") from error


@app.post('/api/apply')
async def apply(body: ApplyBody):
    try:
        baseline, target = bytes(body.baseline), bytes(body.target)
        validate_eq(baseline)
        validate_eq(target, writable=True)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    async with reader.lock:
        reader.require(body.connectionId)
        if reader.live_id != body.liveId:
            raise HTTPException(409, 'Live EQ session changed. Turn Live EQ off and read EQ before continuing.')
        try:
            if body.liveId is None:
                result = await apply_eq(reader.transact, baseline, target)
            else:
                # Start already saved the original EQ. Keep one backup for the whole live session.
                result = await apply_eq(reader.transact, baseline, target, backup=lambda _: None)
            logger.info('EH11 EQ applied; full readback verified.')
            return {'bytes': list(result), 'enabled': True}
        except StaleEqError as error:
            reader.live_id = None
            raise HTTPException(409, str(error)) from error
        except (ApplyError, OSError) as error:
            reader.live_id = None
            logger.warning('EH11 apply failed: %s', error)
            raise HTTPException(503, str(error)) from error
        except Exception as error:
            reader.live_id = None
            # Failures before apply_eq starts writing cannot require rollback.
            logger.warning('EH11 pre-apply read failed: %s', error)
            raise HTTPException(503, 'Could not read a valid EQ baseline. No EQ writes were sent. Reconnect and try again.') from error


@app.post('/api/live/start')
async def live_start(body: LiveStartBody):
    try:
        baseline = bytes(body.baseline)
        validate_eq(baseline, writable=True)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    async with reader.lock:
        reader.require(body.connectionId)
        if reader.live_id is not None:
            raise HTTPException(409, 'Live EQ is already active in another tab.')
        try:
            before = await reader.transact(READ_EQ)
            validate_eq(before)
            if before != baseline:
                raise HTTPException(409, 'Headphone EQ changed. Read EQ again before starting Live EQ.')
            save_backup(before)
            await set_enabled(reader.transact, True)
            reader.live_id = secrets.token_urlsafe(16)
            logger.info('EH11 live EQ started; original EQ backed up.')
            return {'liveId': reader.live_id, 'enabled': True}
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(503, f'Live EQ could not start. {error}') from error


@app.post('/api/live/stop')
async def live_stop(body: LiveStopBody):
    async with reader.lock:
        reader.require(body.connectionId)
        if reader.live_id is not None and reader.live_id != body.liveId:
            raise HTTPException(409, 'That Live EQ session has ended.')
        reader.live_id = None
        return {'stopped': True}


@app.post('/api/eq-enabled')
async def eq_enabled(body: EnabledBody):
    async with reader.lock:
        reader.require(body.connectionId)
        if reader.live_id is not None:
            raise HTTPException(409, 'Turn Live EQ off before changing the headphone EQ switch.')
        try:
            result = await set_enabled(reader.transact, body.enabled)
            logger.info('EH11 EQ switch set and readback verified: %s.', result)
            return {'enabled': result}
        except Exception as error:
            logger.warning('EH11 EQ switch failed: %s', error)
            raise HTTPException(503, str(error)) from error


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def unknown_api(path: str):
    raise HTTPException(404, "Unknown API route.")


if (ROOT / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="editor")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8787, access_log=False)
