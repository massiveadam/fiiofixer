import { copyBands, flatBands, sameBands, validateBands, validatePreamp } from './eq';
import type { EqSettings } from './eq';
import { FrameDecoder, hex, packet, parsePacket } from './protocol';
import type { Command, Packet } from './protocol';
import { SERVICE, TX, RX } from './protocol';

export interface LogEntry { time: string; direction: 'sent' | 'received' | 'info'; message: string }
type Logger = (entry: LogEntry) => void;
interface DeviceTransport {
  name: string;
  request(command: Command, payload: number[]): Promise<Uint8Array>;
  disconnect(): void;
}
export interface BrowserConnection extends DeviceTransport { kind: 'browser' }
export interface LinuxConnection extends DeviceTransport {
  kind: 'linux';
  apply(baseline: Uint8Array, target: Uint8Array): Promise<Uint8Array>;
}
export type ReadTransport = BrowserConnection | LinuxConnection;
const READ_COMMANDS = new Set(['0:2', '0:3', '3:1', '3:13', '8:1', '8:2']);
function assertReadCommand(command: Command): void {
  if (!READ_COMMANDS.has(command.join(':'))) throw new Error('Hardware writes are disabled until the EH11 write protocol is captured and verified.');
}
function log(logger: Logger, direction: LogEntry['direction'], message: string): void { logger({ time: new Date().toISOString(), direction, message }); }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'The operation failed.'; }
export function bluetoothSupport(): string | null {
  if (!window.isSecureContext) return 'Bluetooth needs HTTPS or localhost. For Android testing, use the USB forwarding steps in Help.';
  if (!navigator.bluetooth) return 'This browser has no Bluetooth access. On Linux, start the local helper. On Android, open this app in Chrome.';
  return null;
}

class BrowserTransport implements BrowserConnection {
  readonly kind = 'browser';
  readonly name: string;
  private decoder = new FrameDecoder();
  private pending: { command: Command; resolve: (value: Uint8Array) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private closed = false;
  private onNotification = (): void => {
    const value = this.rx.value;
    if (!value) return;
    try {
      const frames = this.decoder.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      for (const frame of frames) this.receive(frame);
    } catch (error) { this.close(new Error(errorMessage(error))); }
  };
  private onLost = (): void => this.close(new Error('Headphones disconnected. Reconnect to read their current EQ.'));
  private receive(frame: Packet): void {
    log(this.logger, 'received', hex(frame.bytes));
    const current = this.pending;
    if (!current || frame.command[0] !== current.command[0] || frame.command[1] !== current.command[1]) return;
    clearTimeout(current.timer);
    this.pending = null;
    current.resolve(frame.bytes);
  }
  constructor(private device: BluetoothDevice, private tx: BluetoothRemoteGATTCharacteristic, private rx: BluetoothRemoteGATTCharacteristic, private logger: Logger, private onDisconnect: () => void) {
    this.name = device.name ?? 'FiiO EH11';
    this.rx.addEventListener('characteristicvaluechanged', this.onNotification);
    this.device.addEventListener('gattserverdisconnected', this.onLost);
  }
  async request(command: Command, payload: number[]): Promise<Uint8Array> {
    assertReadCommand(command);
    if (this.closed) throw new Error('The Bluetooth session is closed. Reconnect first.');
    if (this.pending) throw new Error('Another Bluetooth request is still in progress.');
    this.decoder = new FrameDecoder();
    const bytes = packet(command, payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(new Error('No reply from EH11 after 6 seconds. The session was closed; reconnect and try again.')), 6000);
      this.pending = { command, resolve, reject, timer };
      log(this.logger, 'sent', hex(bytes));
      const write = this.tx.properties.writeWithoutResponse
        ? this.tx.writeValueWithoutResponse(new Uint8Array(bytes).buffer)
        : this.tx.writeValueWithResponse(new Uint8Array(bytes).buffer);
      write.catch(error => this.close(new Error(errorMessage(error))));
    });
  }
  private close(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
    this.rx.removeEventListener('characteristicvaluechanged', this.onNotification);
    this.device.removeEventListener('gattserverdisconnected', this.onLost);
    this.device.gatt?.disconnect();
    log(this.logger, 'info', error.message);
    this.onDisconnect();
  }
  disconnect(): void { this.close(new Error('Disconnected. Your local EQ draft is still here.')); }
}
export async function connectBrowser(logger: Logger, onDisconnect: () => void): Promise<BrowserConnection> {
  const unsupported = bluetoothSupport();
  if (unsupported) throw new Error(unsupported);
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'FIIO' }, { namePrefix: 'FiiO' }], optionalServices: [SERVICE],
  });
  try {
    if (!device.name || !/\bEH[- ]?11\b/i.test(device.name)) throw new Error('Choose the FiiO EH11. Other FiiO models are not supported by this prototype.');
    if (!device.gatt) throw new Error('This device has no Bluetooth GATT connection.');
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    const tx = await service.getCharacteristic(TX);
    const rx = await service.getCharacteristic(RX);
    const transport = new BrowserTransport(device, tx, rx, logger, onDisconnect);
    try { await rx.startNotifications(); } catch (error) { transport.disconnect(); throw error; }
    log(logger, 'info', 'Connected to EH11 over browser Bluetooth. Hardware writes are disabled.');
    return transport;
  } catch (error) { device.gatt?.disconnect(); throw error; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
export interface BridgeDevice { id: string; name: string }
export class BridgeRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export class LinuxBridge {
  private token: string | null = null;
  private writable = false;
  async status(): Promise<void> {
    const response = await fetch('/api/status', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error('Linux Bluetooth helper is unavailable. Run npm run linux.');
    const data: unknown = await response.json();
    if (!isRecord(data) || data.app !== 'fiiofixer' || typeof data.token !== 'string') throw new Error('Start the FiiOFixer Linux helper with npm run linux.');
    this.token = data.token;
    this.writable = data.hardwareWritesEnabled === true;
  }
  async post(path: string, body: unknown, timeout = 12000): Promise<unknown> {
    if (!this.token) await this.status();
    const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FiiOFixer-Session': this.token ?? '' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout), keepalive: path === 'disconnect' });
    const data: unknown = await response.json();
    if (!response.ok) throw new BridgeRequestError(response.status, isRecord(data) && typeof data.detail === 'string' ? data.detail : 'Linux Bluetooth request failed.');
    return data;
  }
  async scan(): Promise<BridgeDevice[]> {
    const data = await this.post('scan', {}, 16000);
    if (!Array.isArray(data)) throw new Error('The Linux helper returned an invalid device list.');
    return data.map((item: unknown) => {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') throw new Error('The Linux helper returned an invalid device.');
      return { id: item.id, name: item.name };
    });
  }
  async connect(device: BridgeDevice, logger: Logger, onDisconnect: () => void): Promise<LinuxConnection> {
    const connected = await this.post('connect', { id: device.id }, 20000);
    if (!isRecord(connected) || typeof connected.connectionId !== 'string') throw new Error('The Linux helper returned an invalid session.');
    const connectionId = connected.connectionId;
    let closed = false;
    let busy = false;
    const disconnect = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(monitor);
      void this.post('disconnect', { connectionId }).catch(error => log(logger, 'info', `Helper disconnect: ${errorMessage(error)}`));
      onDisconnect();
    };
    const monitor = setInterval(() => {
      if (closed || busy) return;
      void fetch('/api/status', { signal: AbortSignal.timeout(2000) }).then(async response => {
        const status: unknown = await response.json();
        if (!isRecord(status) || status.connectionId !== connectionId) throw new Error('Linux Bluetooth disconnected.');
      }).catch(error => { log(logger, 'info', errorMessage(error)); disconnect(); });
    }, 2500);
    log(logger, 'info', `Connected to ${device.name} through Linux BlueZ.`);
    const readReply = (data: unknown): Uint8Array => {
      if (!isRecord(data) || !Array.isArray(data.bytes) || !data.bytes.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('The Linux helper returned an invalid packet.');
      return Uint8Array.from(data.bytes);
    };
    return {
      kind: 'linux', name: device.name, disconnect,
      apply: async (baseline, target) => {
        if (!this.writable) throw new Error('Update the Linux helper to enable checked EQ writes.');
        if (closed) throw new Error('The Linux Bluetooth session is closed. Reconnect first.');
        if (busy) throw new Error('Another Bluetooth request is still in progress.');
        busy = true;
        try {
          log(logger, 'info', 'Applying EQ with backup and full readback after every changed band.');
          const reply = readReply(await this.post('apply', { connectionId, baseline: Array.from(baseline), target: Array.from(target) }, 240000));
          if (reply.length !== target.length || !reply.every((byte, i) => byte === target[i])) throw new Error('Apply response did not match the requested EQ. Read EQ before continuing.');
          log(logger, 'received', hex(reply));
          return reply;
        } finally { busy = false; }
      },
      request: async (command, payload) => {
        assertReadCommand(command);
        if (closed) throw new Error('The Linux Bluetooth session is closed. Reconnect first.');
        if (busy) throw new Error('Another Bluetooth request is still in progress.');
        busy = true;
        try {
          const bytes = packet(command, payload);
          log(logger, 'sent', hex(bytes));
          const data = await this.post('exchange', { connectionId, bytes: Array.from(bytes) });
          const reply = readReply(data);
          const parsed = parsePacket(reply);
          if (parsed.command[0] !== command[0] || parsed.command[1] !== command[1]) throw new Error('The Linux helper returned a reply to another command.');
          log(logger, 'received', hex(reply));
          return reply;
        } catch (error) { disconnect(); throw error; }
        finally { busy = false; }
      },
    };
  }
}
export class DemoTransport {
  readonly kind = 'demo';
  readonly name = 'EH11 demo';
  private bands = flatBands();
  private preampDb = 0;
  private closed = false;
  constructor(private logger: Logger, private onDisconnect: () => void) {
    this.bands[0] = { frequency: 65, gain: 3, q: 0.71, type: 'lowShelf', enabled: true };
    this.bands[4].gain = -2;
    this.bands[7].gain = -3;
    this.bands[7].q = 1.4;
  }
  async read(): Promise<EqSettings> {
    if (this.closed) throw new Error('Demo session closed.');
    await new Promise(resolve => setTimeout(resolve, 160));
    return { bands: copyBands(this.bands), preampDb: this.preampDb };
  }
  async apply(settings: EqSettings): Promise<EqSettings> {
    if (this.closed) throw new Error('Demo session closed.');
    const expected = { bands: validateBands(settings.bands), preampDb: validatePreamp(settings.preampDb) };
    log(this.logger, 'info', 'DEMO: applying a draft to simulated hardware. No Bluetooth commands sent.');
    await new Promise(resolve => setTimeout(resolve, 350));
    if (this.closed) throw new Error('Demo session closed.');
    this.bands = copyBands(expected.bands); this.preampDb = expected.preampDb;
    const readback = await this.read();
    if (!sameBands(expected.bands, readback.bands) || expected.preampDb !== readback.preampDb) throw new Error('Demo readback did not match.');
    log(this.logger, 'info', 'DEMO: readback matches. Real headphones were not changed.');
    return readback;
  }
  disconnect(): void { if (!this.closed) { this.closed = true; this.onDisconnect(); } }
}
export type Transport = ReadTransport | DemoTransport;
