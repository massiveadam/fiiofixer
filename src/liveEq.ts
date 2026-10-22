const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, i) => byte === b[i]);

/** One checked write at a time. Continuous edits replace the queued target. */
export class LiveEqWriter {
  private pending: Uint8Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flight: Promise<void> | null = null;
  private stopped = false;
  constructor(
    private baseline: Uint8Array,
    private send: (baseline: Uint8Array, target: Uint8Array) => Promise<Uint8Array>,
    private readback: (raw: Uint8Array, caughtUp: boolean) => void,
    private failed: (error: unknown) => void,
    private activity: (pending: boolean) => void,
    private interval = 150,
  ) {}

  submit(target: Uint8Array): void {
    if (this.stopped) return;
    this.pending = target.slice();
    this.activity(true);
    this.schedule();
  }

  private schedule(): void {
    if (this.stopped || this.timer || this.flight) return;
    this.timer = setTimeout(() => { this.timer = null; this.start(); }, this.interval);
  }

  private start(): void {
    const target = this.pending;
    this.pending = null;
    if (this.stopped || !target) return;
    if (equal(this.baseline, target)) { this.activity(false); return; }
    this.flight = this.write(target);
  }

  private async write(target: Uint8Array): Promise<void> {
    try {
      const reply = await this.send(this.baseline, target);
      if (!equal(reply, target)) throw new Error('Live EQ readback did not match. Read EQ before continuing.');
      this.baseline = reply.slice();
      const caughtUp = !this.pending || equal(this.pending, reply);
      if (caughtUp) this.pending = null;
      this.readback(reply, caughtUp);
    } catch (error) {
      this.stopped = true;
      this.pending = null;
      this.failed(error);
    } finally {
      this.flight = null;
      if (this.pending && !this.stopped) this.schedule();
      else this.activity(false);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.pending = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.flight;
    this.activity(false);
  }
}
