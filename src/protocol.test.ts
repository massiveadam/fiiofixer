import { describe, expect, it } from 'vitest';
import { FrameDecoder, packet, parseEq, parsePacket } from './protocol';

// Synthetic framing fixtures. They do not prove any hardware behavior or Q scale.
function eqReply(): Uint8Array {
  const values = new Uint8Array(73);
  values.set([1, 0, 9]);
  const view = new DataView(values.buffer);
  for (let i = 0; i < 10; i++) {
    const at = 3 + i * 7;
    view.setInt16(at, i === 0 ? -73 : 0);
    view.setUint16(at + 2, 200 + i * 100);
    view.setUint16(at + 4, 72);
    values[at + 6] = i % 5;
  }
  return packet([3, 13], Array.from(values));
}
describe('FiiO read framing', () => {
  it('matches the documented read-all query byte for byte', () => {
    expect(Array.from(packet([3, 13], [1, 0, 9]))).toEqual([0xf1, 0x10, 0, 10, 3, 13, 1, 0, 9, 0xff]);
  });
  it('reassembles arbitrary BLE fragmentation and coalesced frames', () => {
    const decoder = new FrameDecoder();
    const reply = eqReply(), second = packet([0, 3], [1, 68]);
    expect(decoder.push(reply.slice(0, 2))).toEqual([]);
    expect(decoder.push(reply.slice(2, 27))).toEqual([]);
    const frames = decoder.push(new Uint8Array([...reply.slice(27), ...second]));
    expect(frames.map(frame => Array.from(frame.bytes))).toEqual([Array.from(reply), Array.from(second)]);
  });
  it('uses the declared length when FF occurs inside a signed gain', () => {
    const reply = eqReply();
    expect(reply[9]).toBe(255);
    expect(new FrameDecoder().push(reply)).toHaveLength(1);
    expect(parseEq(reply, 100)[0].gain).toBe(-7.3);
  });
  it('preserves the two unresolved Q interpretations explicitly', () => {
    expect(parseEq(eqReply(), 100)[0].q).toBe(0.72);
    expect(parseEq(eqReply(), 10)[0].q).toBe(7.2);
  });
  it('preserves every supported filter type, including pass filters', () => {
    expect(parseEq(eqReply(), 100).slice(0, 5).map(band => band.type)).toEqual(['peak', 'lowShelf', 'highShelf', 'lowPass', 'highPass']);
  });
  it('rejects unknown types instead of silently turning them into bell filters', () => {
    const reply = eqReply(); reply[15] = 99;
    expect(() => parseEq(reply, 100)).toThrow('unknown filter type 99');
  });
  it('rejects truncated, wrong-length, wrong-terminator and wrong-command replies', () => {
    const good = eqReply();
    expect(() => parsePacket(good.slice(0, 79))).toThrow();
    const badEnd = good.slice(); badEnd[79] = 0;
    expect(() => parsePacket(badEnd)).toThrow();
    const wrongCmd = good.slice(); wrongCmd[4] = 0x13;
    expect(() => parseEq(wrongCmd, 100)).toThrow();
    const wrongRange = good.slice(); wrongRange[8] = 8;
    expect(() => parseEq(wrongRange, 100)).toThrow();
  });
});
