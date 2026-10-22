import { validateBands } from './eq';
import type { Band, FilterType } from './eq';

export const SERVICE = '00001100-04a5-1000-1000-40ed981a04a5';
export const TX = '00001101-04a5-1000-1000-40ed981a04a5';
export const RX = '00001102-04a5-1000-1000-40ed981a04a5';
export type Command = readonly [number, number];
export type QScale = 10 | 100;
export interface Packet { command: Command; payload: Uint8Array; bytes: Uint8Array }
export function packet(command: Command, payload: number[]): Uint8Array {
  const length = payload.length + 7;
  return new Uint8Array([0xf1, 0x10, length >> 8, length & 0xff, ...command, ...payload, 0xff]);
}
export function parsePacket(bytes: Uint8Array): Packet {
  if (bytes.length < 7 || bytes[0] !== 0xf1 || bytes[1] !== 0x10 || bytes.length !== ((bytes[2] << 8) | bytes[3]) || bytes.at(-1) !== 0xff) throw new Error('Invalid FiiO response frame.');
  return { command: [bytes[4], bytes[5]], payload: bytes.slice(6, -1), bytes };
}
export function parseEq(bytes: Uint8Array, qScale: QScale): Band[] {
  const response = parsePacket(bytes);
  if (response.command[0] !== 0x03 || response.command[1] !== 0x0d || bytes.length !== 80 || response.payload[0] !== 1 || response.payload[1] !== 0 || response.payload[2] !== 9) throw new Error('Expected the full EH11 ten-band EQ response.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: FilterType[] = ['peak', 'lowShelf', 'highShelf', 'lowPass', 'highPass'];
  const bands: Band[] = [];
  for (let i = 0; i < 10; i++) {
    const offset = 9 + i * 7;
    const type = types[bytes[offset + 6]];
    if (!type) throw new Error(`Band ${i + 1} uses unknown filter type ${bytes[offset + 6]}. The raw reply is in diagnostics.`);
    bands.push({ gain: view.getInt16(offset) / 10, frequency: view.getUint16(offset + 2), q: view.getUint16(offset + 4) / qScale, type, enabled: true });
  }
  return validateBands(bands);
}
export class FrameDecoder {
  private buffer = new Uint8Array(0);
  push(chunk: Uint8Array): Packet[] {
    this.buffer = new Uint8Array([...this.buffer, ...chunk]);
    const frames: Packet[] = [];
    while (this.buffer.length >= 4) {
      if (this.buffer[0] !== 0xf1 || this.buffer[1] !== 0x10) { this.buffer = this.buffer.slice(1); continue; }
      const length = (this.buffer[2] << 8) | this.buffer[3];
      if (length < 7 || length > 4096) { this.buffer = this.buffer.slice(1); continue; }
      if (this.buffer.length < length) break;
      const bytes = this.buffer.slice(0, length);
      this.buffer = this.buffer.slice(length);
      frames.push(parsePacket(bytes));
    }
    if (this.buffer.length > 4096) throw new Error('Bluetooth response exceeded the frame limit.');
    return frames;
  }
}
export const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(' ');
