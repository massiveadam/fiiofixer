// Dracula sting on theme switch: a synthesized pipe organ, plus optional
// recorded voice/laugh clips if they are installed in public/sounds.
//
// The recorded clips are NOT redistributed with this project. "Maniacal Laugh 2"
// is CC BY-NC 3.0 and "I Am Dracula" is personal use only, so they live in a
// gitignored folder and the app falls back to synthesized audio when absent.
// Playback is routed to a chosen output device so the effect does not play
// through Bluetooth headphones such as the EH11.

const MUTE_KEY = 'fiiofixer.sound.muted';
const SINK_KEY = 'fiiofixer.sound.sink';
const DECLINED_KEY = 'fiiofixer.sound.sink.declined';
const SAMPLE_RATE = 44100;

const ORGAN_SECONDS = 4.9;
const SYNTH_LAUGH_SECONDS = 2;
const BAT_NOISE_SECONDS = 2;
const LAUGH_OFFSET = 0.5;
const LAUGH_SECONDS = 2.9;

// Shared cinematic timeline, in seconds from the theme switch.
export const DRACULA_TIMING = {
  organStart: 0.3,
  quoteStart: 0.3,
  laughStart: 3.5,
  batStart: 4.6,
  sequenceMs: 10200,
} as const;

let context: AudioContext | null = null;
let organBuffer: AudioBuffer | null = null;
let synthLaughBuffer: AudioBuffer | null = null;
let batNoiseBuffer: AudioBuffer | null = null;
let quoteBuffer: AudioBuffer | null | undefined;
let laughBuffer: AudioBuffer | null | undefined;
let batClipBuffer: AudioBuffer | null | undefined;
let activeSources: AudioBufferSourceNode[] = [];
let sinkApplied = false;

export function isSoundMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function setSoundMuted(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* preference only */ }
  if (muted) stopDraculaSound();
}

export function stopDraculaSound(): void {
  for (const node of activeSources) {
    try { node.stop(); } catch { /* already stopped */ }
  }
  activeSources = [];
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const result = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = result.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return result;
}

function organVoice(ctx: BaseAudioContext, dest: AudioNode, freq: number, start: number, dur: number, gain: number): void {
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.05);
  amp.gain.setValueAtTime(gain, start + dur * 0.72);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.2);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = Math.min(6500, freq * 9);
  lowpass.connect(amp).connect(dest);

  const fundamental = ctx.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.value = freq;
  const detuned = ctx.createOscillator();
  detuned.type = 'triangle';
  detuned.frequency.value = freq;
  detuned.detune.value = 6;
  const octave = ctx.createOscillator();
  octave.type = 'sine';
  octave.frequency.value = freq * 2;
  const octaveGain = ctx.createGain();
  octaveGain.gain.value = 0.34;
  fundamental.connect(lowpass);
  detuned.connect(lowpass);
  octave.connect(octaveGain).connect(lowpass);

  const tremolo = ctx.createOscillator();
  tremolo.frequency.value = 5.6;
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = gain * 0.16;
  tremolo.connect(tremoloDepth).connect(amp.gain);

  for (const node of [fundamental, detuned, octave, tremolo]) {
    node.start(start);
    node.stop(start + dur + 0.25);
  }
}

function organ(ctx: BaseAudioContext, dest: AudioNode): void {
  const voices: Array<[number, number, number, number]> = [
    [73.42, 0.0, 4.6, 0.42],   // D2 pedal
    [146.83, 0.0, 4.6, 0.2],   // D3
    [220.0, 0.0, 4.6, 0.16],   // A3
    [880.0, 0.12, 0.16, 0.3],  // A5
    [783.99, 0.28, 0.16, 0.3], // G5
    [880.0, 0.44, 0.16, 0.3],  // A5
    [698.46, 0.64, 0.14, 0.28],// F5
    [659.25, 0.78, 0.14, 0.28],// E5
    [587.33, 0.92, 0.14, 0.28],// D5
    [554.37, 1.06, 0.14, 0.28],// C#5
    [587.33, 1.2, 0.14, 0.28], // D5
    [659.25, 1.34, 0.14, 0.28],// E5
    [698.46, 1.48, 0.14, 0.28],// F5
    [783.99, 1.62, 0.14, 0.28],// G5
    [880.0, 1.76, 0.42, 0.32], // A5
    [587.33, 2.2, 2.4, 0.22],  // D5 chord
    [698.46, 2.2, 2.4, 0.18],  // F5
    [880.0, 2.2, 2.4, 0.16],   // A5
    [293.66, 2.2, 2.4, 0.16],  // D4
  ];
  for (const [freq, start, dur, gain] of voices) organVoice(ctx, dest, freq, start, dur, gain);
}

function laughSyllable(ctx: BaseAudioContext, dest: AudioNode, start: number, base: number, dur: number): void {
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(0.5, start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  amp.connect(dest);

  const formant1 = ctx.createBiquadFilter();
  formant1.type = 'bandpass';
  formant1.frequency.value = 520;
  formant1.Q.value = 6;
  const formant2 = ctx.createBiquadFilter();
  formant2.type = 'bandpass';
  formant2.frequency.value = 1180;
  formant2.Q.value = 9;
  const formant2Gain = ctx.createGain();
  formant2Gain.gain.value = 0.6;
  formant1.connect(amp);
  formant2.connect(formant2Gain).connect(amp);

  const voice = ctx.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(base * 1.2, start);
  voice.frequency.exponentialRampToValueAtTime(base * 0.8, start + dur);
  voice.connect(formant1);
  voice.connect(formant2);

  const rasp = ctx.createBufferSource();
  rasp.buffer = noiseBuffer(ctx, Math.max(0.1, dur), 2);
  const raspFilter = ctx.createBiquadFilter();
  raspFilter.type = 'bandpass';
  raspFilter.frequency.value = 1400;
  raspFilter.Q.value = 1.2;
  const raspGain = ctx.createGain();
  raspGain.gain.value = 0.16;
  rasp.connect(raspFilter).connect(raspGain).connect(amp);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 17;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = base * 0.06;
  vibrato.connect(vibratoDepth).connect(voice.frequency);

  for (const node of [voice, vibrato]) {
    node.start(start);
    node.stop(start + dur + 0.06);
  }
  rasp.start(start);
  rasp.stop(start + dur);
}

function synthLaugh(ctx: BaseAudioContext, dest: AudioNode, start: number): void {
  const syllables: Array<[number, number, number]> = [
    [0, 168, 0.18],
    [0.22, 152, 0.18],
    [0.44, 138, 0.2],
    [0.68, 124, 0.22],
    [0.94, 108, 0.62],
  ];
  for (const [offset, freq, dur] of syllables) laughSyllable(ctx, dest, start + offset, freq, dur);
}

async function renderOrgan(): Promise<AudioBuffer> {
  if (organBuffer) return organBuffer;
  const offline = new OfflineAudioContext(2, Math.ceil(ORGAN_SECONDS * SAMPLE_RATE), SAMPLE_RATE);
  const master = offline.createGain();
  master.gain.value = 0.9;
  const dry = offline.createGain();
  dry.gain.value = 0.82;
  const reverb = offline.createConvolver();
  reverb.buffer = noiseBuffer(offline, 2.2, 2.6);
  const wet = offline.createGain();
  wet.gain.value = 0.3;
  master.connect(dry).connect(offline.destination);
  master.connect(reverb).connect(wet).connect(offline.destination);
  organ(offline, master);
  organBuffer = await offline.startRendering();
  return organBuffer;
}

async function renderSynthLaugh(): Promise<AudioBuffer> {
  if (synthLaughBuffer) return synthLaughBuffer;
  const offline = new OfflineAudioContext(2, Math.ceil(SYNTH_LAUGH_SECONDS * SAMPLE_RATE), SAMPLE_RATE);
  const master = offline.createGain();
  master.gain.value = 0.9;
  const reverb = offline.createConvolver();
  reverb.buffer = noiseBuffer(offline, 1.6, 2.4);
  const wet = offline.createGain();
  wet.gain.value = 0.24;
  master.connect(offline.destination);
  master.connect(reverb).connect(wet).connect(offline.destination);
  synthLaugh(offline, master, 0);
  synthLaughBuffer = await offline.startRendering();
  return synthLaughBuffer;
}

function batNoise(ctx: BaseAudioContext, dest: AudioNode, start: number): void {
  const whoosh = ctx.createBufferSource();
  whoosh.buffer = noiseBuffer(ctx, BAT_NOISE_SECONDS, 1.1);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(420, start);
  bandpass.frequency.exponentialRampToValueAtTime(2800, start + 0.6);
  bandpass.Q.value = 0.7;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(0.45, start + 0.28);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + BAT_NOISE_SECONDS);
  whoosh.connect(bandpass).connect(amp).connect(dest);
  whoosh.start(start);
  whoosh.stop(start + BAT_NOISE_SECONDS);

  const chirps: Array<[number, number]> = [[0.12, 6200], [0.3, 7400], [0.52, 5200], [0.78, 6900], [1.02, 4700], [1.3, 6100]];
  for (const [offset, freq] of chirps) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start + offset);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, start + offset + 0.06);
    const chirpAmp = ctx.createGain();
    chirpAmp.gain.setValueAtTime(0, start + offset);
    chirpAmp.gain.linearRampToValueAtTime(0.12, start + offset + 0.01);
    chirpAmp.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.09);
    osc.connect(chirpAmp).connect(dest);
    osc.start(start + offset);
    osc.stop(start + offset + 0.1);
  }
}

async function renderBatNoise(): Promise<AudioBuffer> {
  if (batNoiseBuffer) return batNoiseBuffer;
  const offline = new OfflineAudioContext(2, Math.ceil(BAT_NOISE_SECONDS * SAMPLE_RATE), SAMPLE_RATE);
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);
  batNoise(offline, master, 0);
  batNoiseBuffer = await offline.startRendering();
  return batNoiseBuffer;
}

async function loadClip(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}sounds/${file}`);
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function getQuote(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (quoteBuffer === undefined) quoteBuffer = await loadClip(ctx, 'i-am-dracula.mp3');
  return quoteBuffer;
}

async function getLaugh(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (laughBuffer === undefined) laughBuffer = await loadClip(ctx, 'maniacal-laugh.mp3');
  return laughBuffer;
}

async function getBatClip(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (batClipBuffer === undefined) batClipBuffer = await loadClip(ctx, 'bat-chirping.mp3');
  return batClipBuffer;
}

function isHeadphone(label: string): boolean {
  return /head|bud|ear|bluetooth|eh11|fiio|airpod|wh-|wf-|beats|jbl|bose|soundcore|galaxy bud/.test(label);
}

function isSpeaker(label: string): boolean {
  return /speaker|built-?in|internal|analog|line out|realtek|alc|sof|hda|pci|motherboard|stereo|monitor/.test(label);
}

// Pick an output that is not the headphones. Prefer a remembered choice, then
// a device whose label reads like speakers, then ask once via the picker.
async function chooseSinkId(): Promise<string | null> {
  let saved: string | null = null;
  try { saved = localStorage.getItem(SINK_KEY); } catch { /* ignore */ }
  if (saved) return saved;
  if (!navigator.mediaDevices?.enumerateDevices) return null;

  let outputs: MediaDeviceInfo[] = [];
  try {
    outputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audiooutput');
  } catch {
    return null;
  }
  const named = outputs.find(device => device.label && isSpeaker(device.label) && !isHeadphone(device.label));
  if (named) {
    try { localStorage.setItem(SINK_KEY, named.deviceId); } catch { /* ignore */ }
    return named.deviceId;
  }
  const labelled = outputs.some(device => device.label);
  let declined = false;
  try { declined = sessionStorage.getItem(DECLINED_KEY) === '1'; } catch { /* ignore */ }
  const picker = (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> }).selectAudioOutput;
  if (!labelled && !declined && typeof picker === 'function' && outputs.length > 1) {
    try {
      const chosen = await picker.call(navigator.mediaDevices);
      try { localStorage.setItem(SINK_KEY, chosen.deviceId); } catch { /* ignore */ }
      return chosen.deviceId;
    } catch {
      try { sessionStorage.setItem(DECLINED_KEY, '1'); } catch { /* ignore */ }
    }
  }
  return null;
}

async function applySink(ctx: AudioContext): Promise<void> {
  if (sinkApplied) return;
  sinkApplied = true;
  const settable = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (typeof settable.setSinkId !== 'function') return;
  const id = await chooseSinkId();
  if (!id) return;
  try { await settable.setSinkId(id); } catch { /* keep the default output */ }
}

function schedule(ctx: AudioContext, dest: AudioNode, buffer: AudioBuffer, base: number, startAt: number, gain: number, sourceOffset = 0, duration?: number): void {
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  const amp = ctx.createGain();
  amp.gain.value = gain;
  node.connect(amp).connect(dest);
  const when = base + startAt;
  if (duration !== undefined) node.start(when, sourceOffset, duration);
  else if (sourceOffset) node.start(when, sourceOffset);
  else node.start(when);
  activeSources.push(node);
}

export function playDraculaSting(): void {
  if (isSoundMuted()) return;
  if (!context) context = new AudioContext();
  const ctx = context;
  void ctx.resume().catch(() => {});
  void (async () => {
    try {
      await applySink(ctx);
      const [organ, quote, laugh, batClip] = await Promise.all([renderOrgan(), getQuote(ctx), getLaugh(ctx), getBatClip(ctx)]);
      const synth = laugh ? null : await renderSynthLaugh();
      const bats = batClip ? null : await renderBatNoise();

      stopDraculaSound();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const base = ctx.currentTime + 0.03;

      schedule(ctx, master, organ, base, DRACULA_TIMING.organStart, 0.78);
      if (batClip) schedule(ctx, master, batClip, base, DRACULA_TIMING.batStart, 0.9, 0.1, 3.1);
      else if (bats) schedule(ctx, master, bats, base, DRACULA_TIMING.batStart, 0.7);
      if (quote) schedule(ctx, master, quote, base, DRACULA_TIMING.quoteStart, 0.95);
      if (laugh) schedule(ctx, master, laugh, base, DRACULA_TIMING.laughStart, 0.85, LAUGH_OFFSET, LAUGH_SECONDS);
      else if (synth) schedule(ctx, master, synth, base, DRACULA_TIMING.laughStart, 0.8);
    } catch {
      // Sound is an enhancement; a blocked or unsupported context must not break the theme.
    }
  })();
}
