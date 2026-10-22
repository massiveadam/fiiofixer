"""Synthetic protocol and API boundary tests, not an EH11 hardware certification."""
import asyncio
import unittest
from fastapi.testclient import TestClient
from server import app, TOKEN, Frames, Reader, validate_query

READ = bytes.fromhex("f1 10 00 0a 03 0d 01 00 09 ff")
WRITE = bytes.fromhex("f1 10 00 11 13 0d 01 00 00 ff f6 00 64 00 47 00 ff")


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, base_url="http://localhost:8787")
        self.headers = {"X-FiiOFixer-Session": TOKEN}

    def test_status_identifies_the_read_only_helper(self):
        data = self.client.get("/api/status").json()
        self.assertEqual(data["app"], "fiiofixer")
        self.assertFalse(data["hardwareWritesEnabled"])
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
        self.assertIn("Hardware writes are disabled", result.json()["detail"])

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


class FramingTests(unittest.TestCase):
    def test_fragmentation_and_embedded_ff(self):
        frame = bytes.fromhex("f1 10 00 0a 03 0d 01 ff 09 ff")
        frames = Frames()
        self.assertEqual(frames.push(frame[:5]), [])
        self.assertEqual(frames.push(frame[5:] + frame), [frame, frame])


class ReadTests(unittest.IsolatedAsyncioTestCase):
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
