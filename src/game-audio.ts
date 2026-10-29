import type { Spell } from './spells';
import { createAmbientMusic, musicTracks, type MusicTrack } from './ambient-music';

export type GameSound = Spell | 'castle';
export function gameSoundOptions(): readonly { id: GameSound; label: string }[] {
  return [
    { id: 'castle', label: 'Castle built' },
    { id: 'pole', label: 'Move pole' },
    { id: 'knight', label: 'Knight' },
    { id: 'earthquake', label: 'Earthquake' },
    { id: 'swamp', label: 'Swamp' },
    { id: 'volcano', label: 'Volcano' },
    { id: 'flood', label: 'Flood' },
    { id: 'armageddon', label: 'Armageddon' },
  ];
}
interface SoundLayer {
  wave: OscillatorType | 'noise';
  frequency: number;
  endFrequency?: number;
  start: number;
  duration: number;
  gain: number;
}
/** Small, distinct sound recipes; all timing is audio-clock time, not simulation speed. */
export function gameSoundPlan(sound: GameSound): readonly SoundLayer[] {
  const tone = (
    wave: OscillatorType | 'noise',
    frequency: number,
    start: number,
    duration: number,
    gain: number,
    endFrequency?: number,
  ): SoundLayer => ({ wave, frequency, start, duration, gain, endFrequency });
  switch (sound) {
    case 'castle':
      return [
        tone('triangle', 261.63, 0, 0.25, 0.28),
        tone('triangle', 329.63, 0.12, 0.25, 0.28),
        tone('triangle', 392, 0.24, 0.3, 0.28),
        tone('triangle', 523.25, 0.4, 0.65, 0.25),
        tone('sine', 130.81, 0, 0.75, 0.16),
      ];
    case 'pole':
      return [tone('sine', 660, 0, 0.22, 0.3, 990), tone('sine', 1320, 0.1, 0.35, 0.18)];
    case 'knight':
      return [
        tone('square', 220, 0, 0.12, 0.12),
        tone('triangle', 440, 0.1, 0.18, 0.28),
        tone('triangle', 659.25, 0.22, 0.45, 0.25),
        tone('sine', 1320, 0.22, 0.35, 0.1),
      ];
    case 'earthquake':
      // Midrange debris/impacts survive small speakers; bass alone was effectively inaudible.
      return [
        tone('noise', 1600, 0, 0.28, 0.45, 420),
        tone('noise', 1000, 0.16, 0.38, 0.32, 260),
        tone('noise', 650, 0.38, 0.55, 0.24, 180),
        tone('sawtooth', 180, 0, 0.95, 0.18, 90),
        tone('noise', 220, 0, 1.2, 0.36, 65),
        tone('sine', 55, 0, 1.1, 0.25, 28),
      ];
    case 'swamp':
      return [
        tone('noise', 650, 0, 0.7, 0.12, 200),
        ...[170, 240, 140, 280, 190].map((f, i) => tone('sine', f, i * 0.12, 0.18, 0.25, f * 0.45)),
      ];
    case 'volcano':
      return [
        tone('noise', 1600, 0, 1.4, 0.4, 140),
        tone('sawtooth', 65, 0, 0.65, 0.12, 240),
        tone('sine', 75, 0.2, 1.1, 0.35, 28),
      ];
    case 'flood':
      return [tone('noise', 2400, 0, 1.5, 0.38, 400), tone('triangle', 180, 0.1, 1.2, 0.15, 65)];
    case 'armageddon':
      return [
        ...[82.41, 103.83, 123.47].map((f) => tone('sawtooth', f, 0, 1.6, 0.12, f * 0.8)),
        tone('noise', 1200, 0, 1.7, 0.25, 100),
        tone('sine', 329.63, 0.25, 1.1, 0.2),
        tone('sine', 440, 0.45, 1.1, 0.15),
      ];
  }
}

/** Track actual castle transitions, not mesh rebuilds, redraws, or model previews. */
export class CastleSoundTracker {
  private castles = new Set<string>();
  update(keys: Iterable<string>): boolean {
    const next = new Set(keys),
      built = [...next].some((key) => !this.castles.has(key));
    this.castles = next;
    return built;
  }
  reset(): void {
    this.castles.clear();
  }
}

export function createGameAudio(
  options: {
    createContext?: () => AudioContext | null;
    isAudible?: () => boolean;
    isPreviewAudible?: () => boolean;
    isMusicAudible?: () => boolean;
  } = {},
) {
  let context: AudioContext | null = null,
    master: GainNode | null = null,
    noise: AudioBuffer | null = null,
    muted = false,
    disposed = false;
  let musicTrack: MusicTrack = 'ambient',
    musicPreview: MusicTrack | null = null;
  let musicMuted = true,
    music: ReturnType<typeof createAmbientMusic> | null = null;
  const active = new Set<{ stop(): void }>(),
    lastPlayed = new Map<GameSound, number>();
  function unlock(): void {
    if (disposed || (muted && musicMuted)) return;
    try {
      if (!context) {
        const Constructor =
          globalThis.AudioContext ??
          (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        context = options.createContext
          ? options.createContext()
          : Constructor
            ? new Constructor()
            : null;
        if (!context) return;
        master = context.createGain();
        master.gain.value = 0.16;
        master.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * 2), context.sampleRate);
        const samples = noise.getChannelData(0);
        let seed = 17431;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[i] = (seed / 4294967296) * 2 - 1;
        }
      }
      if (context.state === 'suspended')
        void context
          .resume()
          .then(syncMusic)
          .catch(() => {});
      else syncMusic();
    } catch {
      try {
        if (context) void context.close().catch(() => {});
      } catch {
        /* Unavailable audio backend. */
      }
      context = null;
      master = null;
      noise = null;
    }
  }
  function syncMusic(): void {
    if (
      disposed ||
      musicMuted ||
      !context ||
      context.state !== 'running' ||
      options.isMusicAudible?.() !== true
    ) {
      music?.stop();
      return;
    }
    try {
      music ??= createAmbientMusic(context, musicPreview ?? musicTrack);
      music.select(musicPreview ?? musicTrack);
      music.start();
    } catch {
      music?.dispose();
      music = null;
      musicMuted = true;
    }
  }
  function selectMusic(track: MusicTrack): void {
    if (!musicTracks().some((info) => info.id === track)) return;
    musicTrack = track;
    musicPreview = null;
    music?.select(track, true);
    syncMusic();
  }
  function previewMusic(track: MusicTrack | null): boolean {
    if (
      track !== null &&
      (options.isPreviewAudible?.() !== true ||
        musicMuted ||
        !musicTracks().some((info) => info.id === track))
    )
      return false;
    musicPreview = track;
    music?.select(track ?? musicTrack);
    syncMusic();
    return true;
  }
  function setMusicMuted(value: boolean): void {
    musicMuted = value;
    syncMusic();
  }
  function stopAll(): void {
    for (const effect of active) effect.stop();
    active.clear();
    lastPlayed.clear();
  }
  function play(sound: GameSound, preview = false): boolean {
    const ctx = context;
    if (
      disposed ||
      muted ||
      !ctx ||
      !master ||
      !noise ||
      ctx.state !== 'running' ||
      (preview ? options.isPreviewAudible?.() !== true : options.isAudible?.() === false)
    )
      return false;
    const now = ctx.currentTime;
    if (now - (lastPlayed.get(sound) ?? -Infinity) < (sound === 'castle' ? 0.4 : 0.08))
      return false;
    lastPlayed.set(sound, now);
    if (active.size >= 8) {
      const oldest = active.values().next().value!;
      oldest.stop();
      active.delete(oldest);
    }
    const bus = ctx.createGain();
    bus.connect(master);
    const sources = new Set<AudioScheduledSourceNode>();
    let remaining = 0,
      stopped = false;
    const effect = {
      stop() {
        if (stopped) return;
        stopped = true;
        bus.gain.cancelScheduledValues(ctx.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
        bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.02);
        for (const source of sources)
          try {
            source.stop(ctx.currentTime + 0.025);
          } catch {
            /* Already ended. */
          }
      },
    };
    active.add(effect);
    const plan = gameSoundPlan(sound);
    music?.duck(Math.max(...plan.map((layer) => layer.start + layer.duration)));
    for (const layer of plan) {
      const start = now + 0.005 + layer.start,
        end = start + layer.duration,
        gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(layer.gain, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(bus);
      let source: OscillatorNode | AudioBufferSourceNode,
        filter: BiquadFilterNode | null = null;
      if (layer.wave === 'noise') {
        const buffer = ctx.createBufferSource();
        buffer.buffer = noise;
        source = buffer;
        filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.7;
        filter.frequency.setValueAtTime(layer.frequency, start);
        filter.frequency.exponentialRampToValueAtTime(layer.endFrequency ?? layer.frequency, end);
        source.connect(filter);
        filter.connect(gain);
      } else {
        const oscillator = ctx.createOscillator();
        oscillator.type = layer.wave;
        oscillator.frequency.setValueAtTime(layer.frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(
          layer.endFrequency ?? layer.frequency,
          end,
        );
        source = oscillator;
        source.connect(gain);
      }
      remaining++;
      sources.add(source);
      source.onended = () => {
        sources.delete(source);
        source.disconnect();
        gain.disconnect();
        filter?.disconnect();
        if (--remaining === 0) {
          bus.disconnect();
          active.delete(effect);
        }
      };
      source.start(start);
      source.stop(end + 0.025);
    }
    return true;
  }
  function setMuted(value: boolean): void {
    muted = value;
    if (muted) stopAll();
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stopAll();
    music?.dispose();
    music = null;
    master?.disconnect();
    if (context) void context.close().catch(() => {});
    context = null;
    master = null;
    noise = null;
  }
  return {
    unlock,
    syncMusic,
    selectMusic,
    previewMusic,
    get musicTrack() {
      return musicTrack;
    },
    get previewTrack() {
      return musicPreview;
    },
    setMusicMuted,
    pauseMusic: () => music?.stop(),
    get musicMuted() {
      return musicMuted;
    },
    get musicPlaying() {
      return music?.playing ?? false;
    },
    get musicPosition() {
      return music?.position ?? 0;
    },
    play: (sound: GameSound) => play(sound),
    preview(sound: GameSound): boolean {
      if (options.isPreviewAudible?.() !== true) return false;
      stopAll();
      return play(sound, true);
    },
    stopAll,
    setMuted,
    dispose,
    get muted() {
      return muted;
    },
    get activeCount() {
      return active.size;
    },
  };
}
