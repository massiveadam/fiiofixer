"""Synthetic protocol and API boundary tests, not an EH11 hardware certification."""
import asyncio
import unittest
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
from fastapi.testclient import TestClient
from server import app, TOKEN, Frames, Reader, validate_query

READ = bytes.fromhex("f1 10 00 0a 03 0d 01 00 09 ff")
WRITE = bytes.fromhex("f1 10 00 11 13 0d 01 00 00 ff f6 00 64 00 47 00 ff")


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, base_url="http://localhost:8787")
        self.headers = {"X-FiiOFixer-Session": TOKEN}

    def test_status_identifies_checked_write_support(self):
        data = self.client.get("/api/status").json()
        self.assertEqual(data["app"], "fiiofixer")
        self.assertTrue(data["hardwareWritesEnabled"])
        self.assertEqual(data["token"], TOKEN)

    def test_cross_site_and_dns_rebinding_requests_are_rejected(self):
        self.assertEqual(self.client.get("/api/status", headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.client.get("/api/status", headers={"Host": "evil.example:8787"}).status_code, 403)
        self.assertEqual(self.client.get("/api/status", headers={"Origin": "http://localhost:invalid"}).status_code, 403)

    def test_mutations_require_the_session_token_and_json(self):
        self.assertEqual(self.client.post("/api/scan", json={}).status_code, 403)
        self.assertEqual(self.client.post("/api/scan", content="{}", headers=self.headers).status_code, 415)

    def test_eq_write_is_rejected_before_any_bluetooth_operation(self):
        result = self.client.post("/api/exchange", json={"connectionId": "none", "bytes": list(WRITE)}, headers=self.headers)
        self.assertEqual(result.status_code, 400)
        self.assertIn("Use checked Apply", result.json()["detail"])

    def test_unknown_query_payload_is_rejected(self):
        bad = bytearray(READ); bad[8] = 8
        with self.assertRaises(ValueError):
            validate_query(bytes(bad))

    def test_valid_read_requires_a_current_bluetooth_session(self):
        result = self.client.post("/api/exchange", json={"connectionId": "none", "bytes": list(READ)}, headers=self.headers)
        self.assertEqual(result.status_code, 409)

    def test_out_of_range_and_non_integer_bytes_are_rejected(self):
        data = list(READ); data[5] = 256
        self.assertEqual(self.client.post("/api/exchange", json={"connectionId": "x", "bytes": data}, headers=self.headers).status_code, 400)
        data[5] = 0.5
        self.assertEqual(self.client.post("/api/exchange", json={"connectionId": "x", "bytes": data}, headers=self.headers).status_code, 422)

    def test_apply_rejects_invalid_bytes_before_accessing_bluetooth(self):
        body = {'connectionId': 'none', 'baseline': [0]*80, 'target': [0]*80}
        self.assertEqual(self.client.post('/api/apply', json=body, headers=self.headers).status_code, 400)
        body['target'][0] = 256
        self.assertEqual(self.client.post('/api/apply', json=body, headers=self.headers).status_code, 400)
        body['target'][0] = 0.5
        self.assertEqual(self.client.post('/api/apply', json=body, headers=self.headers).status_code, 422)

    def test_apply_validates_access_session_and_hardware_limits(self):
        from test_eq_control import baseline
        body = {'connectionId': 'none', 'baseline': list(baseline()), 'target': list(baseline())}
        self.assertEqual(self.client.post('/api/apply', json=body).status_code, 403)
        self.assertEqual(self.client.post('/api/apply', content='{}', headers=self.headers).status_code, 415)
        self.assertEqual(self.client.post('/api/apply', json=body, headers=self.headers).status_code, 409)
        body['target'][15] = 3
        self.assertEqual(self.client.post('/api/apply', json=body, headers=self.headers).status_code, 400)
        body['target'][15] = 0; body['target'][10] = 121
        self.assertEqual(self.client.post('/api/apply', json=body, headers=self.headers).status_code, 400)

    def test_apply_maps_stale_and_invalid_live_baselines_to_actionable_errors(self):
        from test_eq_control import baseline
        from eq_control import StaleEqError
        from server import reader
        body = {'connectionId': 'test', 'baseline': list(baseline()), 'target': list(baseline())}
        with patch.object(reader, 'require'), patch('server.apply_eq', new=AsyncMock(side_effect=StaleEqError('Read EQ again'))):
            result = self.client.post('/api/apply', json=body, headers=self.headers)
            self.assertEqual(result.status_code, 409)
        with patch.object(reader, 'require'), patch('server.apply_eq', new=AsyncMock(side_effect=ValueError('Bad live EQ'))):
            result = self.client.post('/api/apply', json=body, headers=self.headers)
            self.assertEqual(result.status_code, 503)
            self.assertIn('No EQ writes were sent', result.json()['detail'])


class FramingTests(unittest.TestCase):
    def test_fragmentation_and_embedded_ff(self):
        frame = bytes.fromhex("f1 10 00 0a 03 0d 01 ff 09 ff")
        frames = Frames()
        self.assertEqual(frames.push(frame[:5]), [])
        self.assertEqual(frames.push(frame[5:] + frame), [frame, frame])


class ReadTests(unittest.IsolatedAsyncioTestCase):
    async def test_scan_includes_paired_headphones_that_are_not_advertising(self):
        from server import scan, reader
        device = SimpleNamespace(address='test-eh11', name='FIIO EH11')
        with patch('server.BleakScanner.discover', new=AsyncMock(return_value={})), patch('server.get_paired_eh11_devices', new=AsyncMock(return_value={device.address: device}), create=True):
            result = await scan()
        self.assertEqual(result, [{'id': 'test-eh11', 'name': 'FIIO EH11'}])
        self.assertIs(reader.devices['test-eh11'], device)

    async def test_reader_waits_for_matching_command_and_assembles_notifications(self):
        reader = Reader()
        reply = bytes.fromhex("f1 10 00 09 03 01 01 01 ff")

        class Tx:
            properties = ["write-without-response"]

        class Services:
            def get_characteristic(self, _uuid): return Tx()

        class FakeClient:
            services = Services()
            async def write_gatt_char(self, _tx, data, response):
                self.seen = data
                if response: raise AssertionError("EH11 should use write-without-response in this fixture")
                reader.notify(None, bytes.fromhex("f1 10 00 09 00 03 01 44 ff"))
                reader.notify(None, reply[:3])
                reader.notify(None, reply[3:])

        fake = FakeClient()
        reader.client = fake
        self.assertEqual(await reader.exchange(bytes.fromhex("f1 10 00 08 03 01 01 ff")), reply)
        self.assertEqual(fake.seen, bytes.fromhex("f1 10 00 08 03 01 01 ff"))

    async def test_stale_cleanup_cannot_close_another_connection(self):
        from server import reader
        previous = reader.connection_id
        reader.connection_id = "new-session"
        try:
            with TestClient(app, base_url="http://localhost:8787") as client:
                result = client.post("/api/disconnect", json={"connectionId": "old-session"}, headers={"X-FiiOFixer-Session": TOKEN})
                self.assertEqual(result.status_code, 409)
                self.assertEqual(reader.connection_id, "new-session")
        finally:
            reader.connection_id = previous


if __name__ == "__main__":
    unittest.main()
