import unittest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from server import app, reader, TOKEN
from test_eq_control import Headphones, baseline


class LiveApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, base_url='http://localhost:8787')
        self.headers = {'X-FiiOFixer-Session': TOKEN}
        self.previous_live = reader.live_id
        reader.live_id = None

    def tearDown(self):
        reader.live_id = self.previous_live

    def post(self, path, body):
        return self.client.post('/api/'+path, json={'connectionId':'owned', **body}, headers=self.headers)

    def test_live_session_saves_one_original_backup_and_checks_each_edit(self):
        device = Headphones()
        with patch.object(reader, 'require'), patch.object(reader, 'transact', new=AsyncMock(side_effect=device.exchange)), patch('server.save_backup') as backup:
            started = self.post('live/start', {'baseline':list(baseline())})
            self.assertEqual(started.status_code, 200)
            live = started.json()['liveId']
            before = baseline()
            for gain in [-10, -20]:
                target = bytearray(before);target[72:74] = gain.to_bytes(2,'big',signed=True)
                result = self.post('apply', {'baseline':list(before), 'target':list(target), 'liveId':live})
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json()['bytes'], list(target))
                before = bytes(target)
            backup.assert_called_once_with(baseline())
            self.assertEqual(len(device.writes), 2)
            stopped = self.post('live/stop', {'liveId':live})
            self.assertEqual(stopped.status_code, 200)
            self.assertEqual(device.eq, before)  # Off keeps the last heard EQ.
            self.assertEqual(self.post('apply', {'baseline':list(before),'target':list(baseline()),'liveId':live}).status_code, 409)

    def test_failed_backup_and_stale_start_send_no_writes(self):
        device = Headphones()
        with patch.object(reader, 'require'), patch.object(reader, 'transact', new=AsyncMock(side_effect=device.exchange)), patch('server.save_backup', side_effect=OSError('Disk full')):
            self.assertEqual(self.post('live/start', {'baseline':list(baseline())}).status_code, 503)
            self.assertIsNone(reader.live_id)
            stale = bytearray(baseline());stale[10] = 10
            self.assertEqual(self.post('live/start', {'baseline':list(stale)}).status_code, 409)
            self.assertEqual(device.writes, [])

    def test_live_failure_stops_session_and_stale_handles_cannot_stop_a_new_one(self):
        device = Headphones()
        with patch.object(reader, 'require'), patch.object(reader, 'transact', new=AsyncMock(side_effect=device.exchange)), patch('server.save_backup'):
            first = self.post('live/start', {'baseline':list(baseline())}).json()['liveId']
            target = bytearray(baseline());target[73] = 10
            body = {'baseline':list(baseline()),'target':list(target)}
            self.assertEqual(self.post('apply',body).status_code,409)
            self.assertEqual(self.post('apply',{**body,'liveId':'stale'}).status_code,409)
            device.bad_ack = True
            failed = self.post('apply',{**body,'liveId':first})
            self.assertEqual(failed.status_code,503)
            self.assertIn('Original EQ restored and verified',failed.json()['detail'])
            self.assertEqual(device.eq,baseline())
            self.assertIsNone(reader.live_id)
            second = self.post('live/start', {'baseline':list(baseline())}).json()['liveId']
            self.assertNotEqual(first,second)
            self.assertEqual(self.post('live/stop',{'liveId':first}).status_code,409)
            self.assertEqual(reader.live_id,second)

    def test_live_start_enables_eq_only_after_original_curve_is_backed_up(self):
        device = Headphones();device.switch.enabled = False
        with patch.object(reader,'require'), patch.object(reader,'transact',new=AsyncMock(side_effect=device.exchange)), patch('server.save_backup',side_effect=lambda _: self.assertFalse(device.switch.enabled)) as backup:
            result=self.post('live/start',{'baseline':list(baseline())})
            self.assertEqual(result.status_code,200)
            self.assertTrue(result.json()['enabled'])
            self.assertTrue(device.switch.enabled)
            self.assertEqual(device.writes,[])
            backup.assert_called_once_with(baseline())

    def test_live_activation_failure_restores_switch_and_creates_no_live_id(self):
        device = Headphones();device.switch.enabled=False;device.switch.bad_ack=True
        with patch.object(reader,'require'), patch.object(reader,'transact',new=AsyncMock(side_effect=device.exchange)), patch('server.save_backup'):
            result=self.post('live/start',{'baseline':list(baseline())})
            self.assertEqual(result.status_code,503)
            self.assertFalse(device.switch.enabled)
            self.assertIsNone(reader.live_id)


if __name__ == '__main__':unittest.main()
