import { afterEach, describe, expect, it, vi } from 'vitest';
import { flatBands } from './eq';
import { packet } from './protocol';
import { connectBrowser, DemoTransport, LinuxBridge } from './transport';

class Notifications extends EventTarget {
  value: DataView | undefined;
  startNotifications = async (): Promise<void> => {};
  emit(bytes: Uint8Array): void {
    const data = new Uint8Array(bytes);
    this.value = new DataView(data.buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}
function browserFixture() {
  const rx = new Notifications();
  const tx = { properties: { writeWithoutResponse: true }, writeValueWithoutResponse: vi.fn(async (_buffer: ArrayBuffer) => {}), writeValueWithResponse: vi.fn(async (_buffer: ArrayBuffer) => {}) };
  const disconnect = vi.fn();
  const device = Object.assign(new EventTarget(), {
    name: 'FIIO EH11',
    gatt: { disconnect, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async (uuid: string) => uuid.includes('1101-') ? tx : rx }) }) },
  });
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('navigator', { bluetooth: { requestDevice: async () => device } });
  return { rx, tx, device, disconnect };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('browser request lifecycle with a synthetic Bluetooth boundary', () => {
  it('subscribes before use and accepts only the matching complete reply', async () => {
    const fixture = browserFixture();
    const onLost = vi.fn();
    const transport = await connectBrowser(() => {}, onLost);
    const reply = packet([0, 2], [1, 1, 0]);
    const pending = transport.request([0, 2], [1]);
    fixture.rx.emit(packet([0, 3], [1, 68]));
    fixture.rx.emit(reply.slice(0, 3));
    fixture.rx.emit(reply.slice(3));
    expect(await pending).toEqual(reply);
    expect(fixture.tx.writeValueWithoutResponse).toHaveBeenCalledOnce();
    transport.disconnect();
    expect(onLost).toHaveBeenCalledOnce();
  });
  it('blocks unconfirmed hardware write commands before touching GATT', async () => {
    const fixture = browserFixture();
    const transport = await connectBrowser(() => {}, () => {});
    await expect(transport.request([0x13, 0x0d], [1, 0, 0])).rejects.toThrow('Hardware writes are disabled');
    expect(fixture.tx.writeValueWithoutResponse).not.toHaveBeenCalled();
    transport.disconnect();
  });
  it('closes and rejects a timed-out session instead of reusing stale waiters', async () => {
    vi.useFakeTimers();
    const fixture = browserFixture(), onLost = vi.fn();
    const transport = await connectBrowser(() => {}, onLost);
    const pending = transport.request([0, 2], [1]);
    const rejection = expect(pending).rejects.toThrow('No reply');
    await vi.advanceTimersByTimeAsync(6001); await rejection;
    expect(fixture.disconnect).toHaveBeenCalledOnce();
    expect(onLost).toHaveBeenCalledOnce();
    await expect(transport.request([0, 2], [1])).rejects.toThrow('closed');
  });
  it('rejects concurrent requests and cleans up on device disconnect', async () => {
    const fixture = browserFixture();
    const transport = await connectBrowser(() => {}, () => {});
    const pending = transport.request([0, 2], [1]);
    await expect(transport.request([0, 3], [1])).rejects.toThrow('still in progress');
    const rejection = expect(pending).rejects.toThrow('Headphones disconnected');
    fixture.device.dispatchEvent(new Event('gattserverdisconnected'));
    await rejection;
    fixture.rx.emit(packet([0, 2], [1, 1, 0]));
    await expect(transport.request([0, 2], [1])).rejects.toThrow('closed');
  });
});
describe('demo explicitly keeps simulated settings separate from hardware', () => {
  it('applies and reads back preamp and disabled-filter metadata', async () => {
    vi.useFakeTimers();
    const demo = new DemoTransport(() => {}, () => {});
    const bands = flatBands(); bands[0].enabled = false; bands[2].gain = -4;
    const pending = demo.apply({ bands, preampDb: -5.2389 });
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ bands, preampDb: -5.2389 });
    demo.disconnect();
    await expect(demo.read()).rejects.toThrow('closed');
  });
});
describe('Linux navigation cleanup', () => {
  it('keeps the disconnect request alive across navigation with the correct session ID', async () => {
    const fetch = vi.fn(async (path: string) => ({ ok: true, json: async () => path === '/api/status' ? { app: 'fiiofixer', token: 'test-token' } : { connectionId: 'test-session' } }));
    vi.stubGlobal('fetch', fetch);
    const bridge = new LinuxBridge();
    const transport = await bridge.connect({ id: 'test-device', name: 'FIIO EH11' }, () => {}, () => {});
    transport.disconnect();
    expect(fetch).toHaveBeenCalledWith('/api/disconnect', expect.objectContaining({ keepalive: true, body: JSON.stringify({ connectionId: 'test-session' }) }));
  });
  it.each(['start', 'stop'])('closes Bluetooth after a lost live %s reply so a live ID cannot remain stranded', async failure => {
    const fetch = vi.fn(async (path: string) => {
      if (path === `/api/live/${failure}`) throw new Error('Connection lost');
      const data = path === '/api/status' ? { app: 'fiiofixer', token: 'test-token', hardwareWritesEnabled: true, liveEqEnabled: true }
        : path === '/api/connect' ? { connectionId: 'owned' } : path === '/api/live/start' ? { liveId: 'live' } : {};
      return { ok: true, json: async () => data };
    });
    vi.stubGlobal('fetch', fetch);
    const lost = vi.fn();
    const transport = await new LinuxBridge().connect({ id: 'device', name: 'FIIO EH11' }, () => {}, lost);
    if (failure === 'start') await expect(transport.startLive(new Uint8Array())).rejects.toThrow('Connection lost');
    else {
      const live = await transport.startLive(new Uint8Array());
      await expect(live.stop()).rejects.toThrow('Connection lost');
    }
    expect(lost).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/disconnect', expect.objectContaining({ keepalive: true }));
  });
});
