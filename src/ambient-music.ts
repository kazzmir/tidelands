export interface AmbientNote {
  midi: number;
  start: number;
  duration: number;
  kind: 'pad' | 'bass' | 'bell';
  gain: number;
  pan: number;
}

/** An original 24-second D-major ambient phrase; tails wrap into the next loop. */
export function ambientScore(): readonly AmbientNote[] {
  const notes: AmbientNote[] = [];
  const chords = [
      [62, 66, 69],
      [59, 62, 66],
      [55, 59, 62],
      [57, 61, 64],
    ],
    bass = [50, 47, 43, 45];
  chords.forEach((chord, bar) => {
    chord.forEach((midi, i) =>
      notes.push({
        midi,
        start: bar * 6,
        duration: 7.8,
        kind: 'pad',
        gain: 0.1,
        pan: (i - 1) * 0.45,
      }),
    );
    notes.push({
      midi: bass[bar],
      start: bar * 6,
      duration: 6.6,
      kind: 'bass',
      gain: 0.065,
      pan: 0,
    });
  });
  const melody = [
    [0.75, 74],
    [3, 78],
    [5.25, 76],
    [7.5, 74],
    [10.5, 71],
    [13.5, 74],
    [15, 78],
    [17.25, 76],
    [19.5, 73],
    [21.75, 69],
    [23.25, 74],
  ];
  melody.forEach(([start, midi], i) =>
    notes.push({ midi, start, duration: 3.2, kind: 'bell', gain: 0.055, pan: i % 2 ? 0.3 : -0.3 }),
  );
  return notes;
}

/** Render once at a modest sample rate: one looping source, no recurring scheduling timer. */
export function createAmbientBuffer(context: BaseAudioContext): AudioBuffer {
  const rate = 16000,
    length = 24 * rate,
    buffer = context.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0),
    right = buffer.getChannelData(1);
  for (const note of ambientScore()) {
    const frequency = 440 * 2 ** ((note.midi - 69) / 12),
      start = Math.round(note.start * rate),
      count = Math.round(note.duration * rate);
    const l = Math.cos(((note.pan + 1) * Math.PI) / 4),
      r = Math.sin(((note.pan + 1) * Math.PI) / 4);
    for (let i = 0; i < count; i++) {
      const t = i / rate,
        remaining = note.duration - t,
        phase = 2 * Math.PI * frequency * t;
      let wave: number, envelope: number;
      if (note.kind === 'pad') {
        wave =
          (Math.sin(phase) + 0.35 * Math.sin(phase * 1.003) + 0.08 * Math.sin(phase * 2)) / 1.43;
        envelope = Math.min(1, t / 1.8, remaining / 2.8);
        envelope *= envelope;
      } else if (note.kind === 'bell') {
        wave = Math.sin(phase) + 0.18 * Math.sin(phase * 2) * Math.exp(-t * 2);
        envelope = Math.min(1, t / 0.045) * Math.exp(-t * 1.15) * Math.min(1, remaining / 0.5);
      } else {
        wave = Math.sin(phase) + 0.12 * Math.sin(phase * 2);
        envelope = Math.min(1, t / 1.1, remaining / 1.8);
      }
      const value = wave * envelope * note.gain,
        index = (start + i) % length;
      left[index] += value * l;
      right[index] += value * r;
    }
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = peak > 0 ? 0.3 / peak : 1;
  for (let i = 0; i < length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
  return buffer;
}

export function createAmbientMusic(context: AudioContext) {
  let buffer: AudioBuffer | null = null,
    voice: { source: AudioBufferSourceNode; gain: GainNode } | null = null,
    offset = 0,
    started = 0,
    disposed = false;
  const fading = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();
  function start(): void {
    if (disposed || voice || context.state !== 'running') return;
    buffer ??= createAmbientBuffer(context);
    const source = context.createBufferSource(),
      gain = context.createGain(),
      now = context.currentTime;
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 2);
    const current = { source, gain };
    voice = current;
    started = now;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      fading.delete(current);
      if (voice === current) {
        offset = (offset + Math.max(0, context.currentTime - started)) % 24;
        voice = null;
      }
    };
    source.start(now, offset);
  }
  function duck(seconds: number): void {
    if (!voice) return;
    const now = context.currentTime,
      param = voice.gain.gain,
      level = Math.min(0.025, Math.max(0, param.value));
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(level, now + 0.04);
    param.setValueAtTime(level, now + Math.max(0.1, Math.min(2, seconds)));
    param.linearRampToValueAtTime(0.1, now + Math.max(0.1, Math.min(2, seconds)) + 1.2);
  }
  function stop(): void {
    if (!voice) return;
    const current = voice;
    voice = null;
    offset = (offset + Math.max(0, context.currentTime - started)) % 24;
    const now = context.currentTime,
      fade = context.state === 'running' ? 0.06 : 0;
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setValueAtTime(current.gain.gain.value, now);
    current.gain.gain.linearRampToValueAtTime(0, now + fade);
    fading.add(current);
    try {
      current.source.stop(now + fade);
    } catch {
      /* Audio device may already be closed. */
    }
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stop();
    for (const current of fading) {
      current.source.onended = null;
      try {
        current.source.stop();
      } catch {
        /* Already stopped. */
      }
      current.source.disconnect();
      current.gain.disconnect();
    }
    fading.clear();
    buffer = null;
  }
  return {
    start,
    duck,
    stop,
    dispose,
    get playing() {
      return voice !== null;
    },
    get position() {
      return (offset + (voice ? Math.max(0, context.currentTime - started) : 0)) % 24;
    },
  };
}
