export type BackgroundTrack = 'ambient' | 'upbeat';
export type EndingTrack = 'victory' | 'defeat';
export type MusicTrack = BackgroundTrack | EndingTrack;
export function musicTracks(): readonly {
  id: BackgroundTrack;
  name: string;
  bpm: number;
  seconds: number;
}[] {
  return [
    { id: 'ambient', name: 'Quiet Tides', bpm: 80, seconds: 24 },
    { id: 'upbeat', name: 'Bright Currents', bpm: 120, seconds: 16 },
  ];
}
export function endingMusicTracks(): readonly {
  id: EndingTrack;
  name: string;
  bpm: number;
  seconds: number;
}[] {
  return [
    { id: 'victory', name: 'Victory — A New Dawn', bpm: 108, seconds: 8 },
    { id: 'defeat', name: 'Defeat — Fading Shores', bpm: 64, seconds: 9 },
  ];
}
export function allMusicTracks() {
  return [...musicTracks(), ...endingMusicTracks()];
}
/** Independent of the seeded terrain/AI random streams. */
export function chooseMusicTrack(random: () => number = Math.random): BackgroundTrack {
  return random() < 0.5 ? 'ambient' : 'upbeat';
}
function trackDuration(track: MusicTrack): number {
  return track === 'victory' ? 8 : track === 'defeat' ? 9 : track === 'upbeat' ? 16 : 24;
}
export interface AmbientNote {
  midi: number;
  start: number;
  duration: number;
  kind: 'pad' | 'bass' | 'bell' | 'pluck' | 'kick' | 'shaker';
  gain: number;
  pan: number;
}
/** An original 24-second D-major ambient phrase; tails wrap into the next loop. */
export function ambientScore(): readonly AmbientNote[] {
  const notes: AmbientNote[] = [],
    chords = [
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
/** A separate 120 BPM tune with bright arpeggios, rhythmic bass and light percussion. */
export function upbeatScore(): readonly AmbientNote[] {
  const notes: AmbientNote[] = [],
    chords = [
      [62, 66, 69],
      [57, 61, 64],
      [59, 62, 66],
      [55, 59, 62],
    ],
    roots = [50, 45, 47, 43];
  const melody = [
    [78, 81, 78, 76],
    [76, 73, 76, 81],
    [78, 74, 71, 74],
    [74, 78, 76, 74],
  ];
  chords.forEach((chord, bar) => {
    const start = bar * 4;
    chord.forEach((midi, i) =>
      notes.push({ midi, start, duration: 4.7, kind: 'pad', gain: 0.055, pan: (i - 1) * 0.45 }),
    );
    for (let i = 0; i < 16; i++)
      notes.push({
        midi: chord[[0, 2, 1, 2, 0, 1, 2, 1][i % 8]] + (i % 8 >= 4 ? 12 : 0),
        start: start + i * 0.25,
        duration: 0.34,
        kind: 'pluck',
        gain: 0.065,
        pan: i % 2 ? 0.4 : -0.4,
      });
    for (let beat = 0; beat < 8; beat++) {
      notes.push({
        midi: roots[bar] + (beat % 4 === 3 ? 7 : 0),
        start: start + beat * 0.5,
        duration: 0.38,
        kind: 'bass',
        gain: 0.09,
        pan: 0,
      });
      notes.push({
        midi: 38,
        start: start + beat * 0.5,
        duration: 0.16,
        kind: 'kick',
        gain: 0.085,
        pan: 0,
      });
      notes.push({
        midi: 90,
        start: start + beat * 0.5 + 0.25,
        duration: 0.06,
        kind: 'shaker',
        gain: 0.018,
        pan: beat % 2 ? 0.3 : -0.3,
      });
    }
    melody[bar].forEach((midi, i) =>
      notes.push({
        midi,
        start: start + i + 0.5,
        duration: 0.65,
        kind: 'bell',
        gain: 0.065,
        pan: i % 2 ? 0.2 : -0.2,
      }),
    );
  });
  return notes;
}
/** Short resolving themes: bright D-major victory, descending B-minor defeat. */
export function endingScore(track: EndingTrack): readonly AmbientNote[] {
  const notes: AmbientNote[] = [];
  const chord = (pitches: number[], start: number, duration: number) => {
    pitches.forEach((midi, i) =>
      notes.push({
        midi,
        start,
        duration,
        kind: 'pad',
        gain: 0.08,
        pan: (i - (pitches.length - 1) / 2) * 0.25,
      }),
    );
  };
  if (track === 'victory') {
    chord([62, 66, 69], 0, 2.4);
    chord([67, 71, 74], 1.8, 2.2);
    chord([62, 66, 69, 74], 3.6, 4.4);
    [74, 78, 81, 86, 85, 86].forEach((midi, i) =>
      notes.push({
        midi,
        start: [0, 0.45, 0.9, 1.35, 2.1, 2.55][i],
        duration: 1.35,
        kind: 'bell',
        gain: 0.09,
        pan: i % 2 ? 0.2 : -0.2,
      }),
    );
    for (const [midi, start, duration] of [
      [50, 0, 2],
      [43, 1.8, 1.8],
      [45, 2.7, 1.2],
      [50, 3.6, 4.4],
    ])
      notes.push({ midi, start, duration, kind: 'bass', gain: 0.1, pan: 0 });
    notes.push({ midi: 86, start: 4.1, duration: 2.4, kind: 'bell', gain: 0.06, pan: 0.2 });
  } else {
    chord([59, 62, 66], 0, 3.8);
    chord([55, 59, 62], 2.5, 3.4);
    chord([59, 62, 66], 4.5, 4.5);
    [74, 73, 71, 66, 62, 59].forEach((midi, i) =>
      notes.push({
        midi,
        start: [0, 0.7, 1.4, 2.2, 3, 4][i],
        duration: 2.3,
        kind: 'bell',
        gain: 0.065,
        pan: i % 2 ? 0.15 : -0.15,
      }),
    );
    for (const [midi, start, duration] of [
      [47, 0, 3.8],
      [43, 2.5, 3.4],
      [47, 4.5, 4.5],
    ])
      notes.push({ midi, start, duration, kind: 'bass', gain: 0.08, pan: 0 });
  }
  return notes;
}

/** Render once per track; background loops wrap tails, ending songs resolve into silence. */
export function createAmbientBuffer(
  context: BaseAudioContext,
  track: MusicTrack = 'ambient',
): AudioBuffer {
  const rate = 16000,
    length = trackDuration(track) * rate,
    buffer = context.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0),
    right = buffer.getChannelData(1);
  const ending = track === 'victory' || track === 'defeat';
  for (const note of ending
    ? endingScore(track)
    : track === 'upbeat'
      ? upbeatScore()
      : ambientScore()) {
    const frequency = 440 * 2 ** ((note.midi - 69) / 12),
      start = Math.round(note.start * rate),
      count = Math.round(note.duration * rate);
    const l = Math.cos(((note.pan + 1) * Math.PI) / 4),
      r = Math.sin(((note.pan + 1) * Math.PI) / 4);
    let noiseSeed = 137 + start + note.midi,
      lastNoise = 0;
    for (let i = 0; i < count; i++) {
      const t = i / rate,
        remaining = note.duration - t,
        phase = 2 * Math.PI * frequency * t;
      let wave: number, envelope: number;
      if (note.kind === 'pad') {
        wave =
          (Math.sin(phase) + 0.35 * Math.sin(phase * 1.003) + 0.08 * Math.sin(phase * 2)) / 1.43;
        envelope = Math.min(
          1,
          t / (track === 'ambient' ? 1.8 : 0.22),
          remaining / (track === 'ambient' ? 2.8 : 0.65),
        );
        envelope *= envelope;
      } else if (note.kind === 'bell') {
        wave = Math.sin(phase) + 0.18 * Math.sin(phase * 2) * Math.exp(-t * 2);
        envelope =
          Math.min(1, t / (track === 'upbeat' ? 0.012 : 0.045)) *
          Math.exp(-t * (track === 'upbeat' ? 3 : 1.15)) *
          Math.min(1, remaining / (track === 'upbeat' ? 0.12 : 0.5));
      } else if (note.kind === 'pluck') {
        wave = Math.sin(phase) + 0.3 * Math.sin(phase * 2) + 0.12 * Math.sin(phase * 3);
        envelope = Math.min(1, t / 0.009) * Math.exp(-t * 9) * Math.min(1, remaining / 0.045);
      } else if (note.kind === 'kick') {
        wave = Math.sin(2 * Math.PI * (48 * t + (48 * (1 - Math.exp(-t * 28))) / 28));
        envelope = Math.min(1, t / 0.005) * Math.exp(-t * 22) * Math.min(1, remaining / 0.035);
      } else if (note.kind === 'shaker') {
        noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
        const value = (noiseSeed / 4294967296) * 2 - 1;
        wave = (value - lastNoise) * 0.5;
        lastNoise = value;
        envelope = Math.min(1, t / 0.004) * Math.exp(-t * 55) * Math.min(1, remaining / 0.015);
      } else {
        wave = Math.sin(phase) + 0.12 * Math.sin(phase * 2);
        envelope = Math.min(
          1,
          t / (track === 'upbeat' ? 0.015 : 1.1),
          remaining / (track === 'upbeat' ? 0.13 : 1.8),
        );
      }
      if (ending && start + i >= length) break;
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
export function createAmbientMusic(context: AudioContext, initialTrack: MusicTrack = 'ambient') {
  const buffers = new Map<MusicTrack, AudioBuffer>(),
    positions = new Map<MusicTrack, number>(),
    completed = new Set<MusicTrack>();
  function positionAt(time: number): number {
    const value = offset + Math.max(0, time - started);
    return track === 'victory' || track === 'defeat'
      ? Math.min(trackDuration(track), value)
      : value % trackDuration(track);
  }
  let track = initialTrack,
    voice: { source: AudioBufferSourceNode; gain: GainNode } | null = null,
    offset = 0,
    started = 0,
    disposed = false;
  const fading = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();
  function start(): void {
    if (disposed || voice || completed.has(track) || context.state !== 'running') return;
    let buffer = buffers.get(track);
    if (!buffer) {
      buffer = createAmbientBuffer(context, track);
      buffers.set(track, buffer);
    }
    const source = context.createBufferSource(),
      gain = context.createGain(),
      now = context.currentTime;
    source.buffer = buffer;
    source.loop = track === 'ambient' || track === 'upbeat';
    source.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      track === 'victory' ? 0.13 : 0.1,
      now + (source.loop ? 2 : 0.12),
    );
    const current = { source, gain };
    voice = current;
    started = now;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      fading.delete(current);
      if (voice === current) {
        offset = positionAt(context.currentTime);
        if (!source.loop) completed.add(track);
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
    param.linearRampToValueAtTime(
      track === 'victory' ? 0.13 : 0.1,
      now + Math.max(0.1, Math.min(2, seconds)) + 1.2,
    );
  }
  function stop(): void {
    if (!voice) return;
    const current = voice;
    voice = null;
    offset = positionAt(context.currentTime);
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
  function select(next: MusicTrack, restart = false): void {
    if (disposed || (next === track && !restart)) return;
    if (!allMusicTracks().some((info) => info.id === next)) return;
    stop();
    positions.set(track, offset);
    track = next;
    offset = restart ? 0 : (positions.get(next) ?? 0);
    if (restart) completed.delete(next);
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
    buffers.clear();
    positions.clear();
    completed.clear();
  }
  return {
    start,
    duck,
    stop,
    select,
    dispose,
    get track() {
      return track;
    },
    get playing() {
      return voice !== null;
    },
    get finished() {
      return completed.has(track);
    },
    get position() {
      return voice ? positionAt(context.currentTime) : offset;
    },
  };
}
