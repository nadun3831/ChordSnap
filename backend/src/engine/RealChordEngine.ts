import fs from 'fs';
import { ChordDetectionEngine, ChordEvent } from './ChordDetectionEngine';

/**
 * RealChordEngine — Beat-aligned chord detection
 *
 * Pipeline:
 *   1. Decode audio to mono PCM
 *   2. Detect tempo (BPM) via onset strength + autocorrelation
 *   3. Build beat grid — exact timestamps where each beat falls
 *   4. Extract chroma (12-bin pitch class energy) per beat window
 *   5. Match each beat's chroma against chord templates
 *   6. Merge consecutive identical chords into timed events
 *
 * This approach gives chords at the RIGHT TIME because music
 * changes chords on beat boundaries, not at arbitrary intervals.
 */

// ─────────────────────────────────────────────
// Chord Templates — weighted profiles for each chord type
// Indices: [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
// Root gets higher weight to reflect acoustic reality
// ─────────────────────────────────────────────

const CHORD_TYPES: Record<string, { profile: number[]; bias: number }> = {
  // Major triad: root, M3, P5 — most common, strong preference
  'maj': {
    profile: [1.5, 0, 0, 0, 1.0, 0, 0, 1.2, 0, 0, 0, 0],
    bias: 0.06,
  },
  // Minor triad: root, m3, P5 — very common
  'm': {
    profile: [1.5, 0, 0, 1.0, 0, 0, 0, 1.2, 0, 0, 0, 0],
    bias: 0.06,
  },
  // Dominant 7th: root, M3, P5, m7
  '7': {
    profile: [1.5, 0, 0, 0, 1.0, 0, 0, 1.2, 0, 0, 0.7, 0],
    bias: -0.02,
  },
  // Minor 7th: root, m3, P5, m7
  'm7': {
    profile: [1.5, 0, 0, 1.0, 0, 0, 0, 1.2, 0, 0, 0.7, 0],
    bias: -0.02,
  },
  // Major 7th: root, M3, P5, M7
  'maj7': {
    profile: [1.5, 0, 0, 0, 1.0, 0, 0, 1.2, 0, 0, 0, 0.7],
    bias: -0.05, // strong penalty — very often false positive over plain major
  },
  // Suspended 4th: root, P4, P5
  'sus4': {
    profile: [1.5, 0, 0, 0, 0, 1.0, 0, 1.2, 0, 0, 0, 0],
    bias: -0.04,
  },
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface ChordTemplate {
  label: string;
  profile: number[];
  bias: number;
}

function buildAllTemplates(): ChordTemplate[] {
  const templates: ChordTemplate[] = [];
  for (const [typeName, { profile, bias }] of Object.entries(CHORD_TYPES)) {
    for (let root = 0; root < 12; root++) {
      const rotated = new Array(12);
      for (let i = 0; i < 12; i++) {
        rotated[(i + root) % 12] = profile[i];
      }
      const label = typeName === 'maj'
        ? NOTE_NAMES[root]
        : `${NOTE_NAMES[root]}${typeName}`;
      templates.push({ label, profile: rotated, bias });
    }
  }
  return templates;
}

const ALL_TEMPLATES = buildAllTemplates();

// ─────────────────────────────────────────────
// Similarity helpers
// ─────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function normalizeChroma(chroma: number[]): number[] {
  const sum = chroma.reduce((s, v) => s + v, 0);
  if (sum < 0.001) return new Array(12).fill(0);
  return chroma.map(v => v / sum);
}

function matchChord(chroma: number[]): { label: string; confidence: number } {
  const normalized = normalizeChroma(chroma);
  let bestLabel = 'N';
  let bestScore = -1;

  for (const tmpl of ALL_TEMPLATES) {
    const score = cosineSimilarity(normalized, tmpl.profile) + tmpl.bias;
    if (score > bestScore) {
      bestScore = score;
      bestLabel = tmpl.label;
    }
  }

  return { label: bestLabel, confidence: Math.max(0, Math.min(1, bestScore)) };
}

// ─────────────────────────────────────────────
// Beat detection helpers
// ─────────────────────────────────────────────

const FRAME_SIZE = 1024;
const HOP = 512;
const MIN_BPM = 40;
const MAX_BPM = 220;
const MIN_CONFIDENCE = 0.60;

/**
 * Compute onset strength envelope from audio samples.
 * Uses spectral flux — increase in spectral energy between frames.
 */
function computeOnsetEnvelope(samples: Float32Array, sampleRate: number): { envelope: number[]; times: number[] } {
  const envelope: number[] = [];
  const times: number[] = [];
  let prevSpectrum: number[] | null = null;

  for (let offset = 0; offset + FRAME_SIZE <= samples.length; offset += HOP) {
    const frame = samples.slice(offset, offset + FRAME_SIZE);

    // Simple magnitude spectrum via squared values in frequency bands
    // We don't need full FFT — use band energy approximation
    const numBands = 40;
    const bandSize = Math.floor(FRAME_SIZE / numBands);
    const spectrum: number[] = [];

    for (let b = 0; b < numBands; b++) {
      let bandEnergy = 0;
      const start = b * bandSize;
      for (let i = start; i < start + bandSize && i < FRAME_SIZE; i++) {
        bandEnergy += frame[i] * frame[i];
      }
      spectrum.push(bandEnergy);
    }

    if (prevSpectrum) {
      // Spectral flux: sum of positive differences (half-wave rectified)
      let flux = 0;
      for (let b = 0; b < numBands; b++) {
        const diff = spectrum[b] - prevSpectrum[b];
        if (diff > 0) flux += diff;
      }
      envelope.push(flux);
      times.push(offset / sampleRate);
    }

    prevSpectrum = spectrum;
  }

  return { envelope, times };
}

/**
 * Detect BPM using autocorrelation of onset envelope.
 */
function detectBPM(envelope: number[], sampleRate: number): number {
  const hopDuration = HOP / sampleRate; // seconds per onset frame
  const minLag = Math.floor(60 / (MAX_BPM * hopDuration));
  const maxLag = Math.floor(60 / (MIN_BPM * hopDuration));
  const N = envelope.length;

  // Mean-normalize envelope
  const mean = envelope.reduce((s, v) => s + v, 0) / N;
  const normed = envelope.map(v => v - mean);

  // Autocorrelation
  let bestLag = minLag;
  let bestCorr = -Infinity;

  for (let lag = minLag; lag <= Math.min(maxLag, N - 1); lag++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < N - lag; i++) {
      corr += normed[i] * normed[i + lag];
      count++;
    }
    corr /= count;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const bpm = 60 / (bestLag * hopDuration);
  return Math.round(bpm * 10) / 10;
}

/**
 * Build beat grid: evenly-spaced beat times starting from the first strong onset.
 */
function buildBeatGrid(
  envelope: number[],
  times: number[],
  bpm: number,
  totalDuration: number,
): number[] {
  // Find first strong onset as starting beat
  const maxOnset = Math.max(...envelope);
  const threshold = maxOnset * 0.15;

  let firstBeatTime = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > threshold) {
      firstBeatTime = times[i];
      break;
    }
  }

  // Build grid at beat intervals
  const beatInterval = 60 / bpm; // seconds per beat
  const beats: number[] = [];

  for (let t = firstBeatTime; t < totalDuration; t += beatInterval) {
    beats.push(Math.round(t * 100) / 100);
  }

  return beats;
}

// ─────────────────────────────────────────────
// Engine implementation
// ─────────────────────────────────────────────

export class RealChordEngine implements ChordDetectionEngine {
  readonly name = 'RealChordEngine (Beat-Aligned)';

  async analyze(audioPath: string): Promise<ChordEvent[]> {
    console.log(`🎵 RealChordEngine: Analyzing ${audioPath}`);
    const startTime = Date.now();

    // ── 1. Read & decode audio ──
    const fileBuffer = fs.readFileSync(audioPath);
    const { default: decode } = await import('audio-decode');
    const audioData = await decode(fileBuffer);

    const sampleRate = audioData.sampleRate;
    let samples: Float32Array;
    if (audioData.channelData.length > 1) {
      const left = audioData.channelData[0];
      const right = audioData.channelData[1];
      samples = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        samples[i] = (left[i] + right[i]) / 2;
      }
    } else {
      samples = audioData.channelData[0];
    }

    const totalDuration = samples.length / sampleRate;
    console.log(`   Decoded: ${totalDuration.toFixed(1)}s, ${sampleRate}Hz`);

    // ── 2. Detect tempo (BPM) ──
    const { envelope, times: onsetTimes } = computeOnsetEnvelope(samples, sampleRate);
    const bpm = detectBPM(envelope, sampleRate);
    console.log(`   🥁 Detected BPM: ${bpm}`);

    // ── 3. Build beat grid ──
    const beats = buildBeatGrid(envelope, onsetTimes, bpm, totalDuration);
    console.log(`   🎯 Beat grid: ${beats.length} beats (interval: ${(60 / bpm).toFixed(3)}s)`);

    // ── 4. Extract chroma per beat ──
    // For each beat, average chroma over a window centered on the beat
    const Meyda = require('meyda');
    const CHROMA_BUFFER = 8192; // larger window = better frequency resolution
    Meyda.bufferSize = CHROMA_BUFFER;
    Meyda.sampleRate = sampleRate;

    // Pre-compute: how many samples is one beat?
    const beatSamples = Math.floor((60 / bpm) * sampleRate);
    // Analysis window: centered on beat, ~80% of beat duration
    const windowSamples = Math.min(
      Math.floor(beatSamples * 0.8),
      CHROMA_BUFFER
    );
    // If window is smaller than CHROMA_BUFFER, we'll zero-pad
    const useBufferSize = Math.max(windowSamples, CHROMA_BUFFER);

    interface BeatChroma {
      beatTime: number;
      chroma: number[];
      energy: number;
    }

    const beatChromas: BeatChroma[] = [];

    for (const beatTime of beats) {
      const centerSample = Math.floor(beatTime * sampleRate);
      const halfWindow = Math.floor(useBufferSize / 2);
      const start = Math.max(0, centerSample - halfWindow);
      const end = Math.min(samples.length, start + useBufferSize);

      if (end - start < CHROMA_BUFFER) continue; // skip if too near edge

      const frame = samples.slice(start, start + CHROMA_BUFFER);

      // Compute energy
      let energy = 0;
      for (let i = 0; i < frame.length; i++) {
        energy += frame[i] * frame[i];
      }
      energy /= frame.length;

      if (energy < 1e-6) {
        // Silence
        beatChromas.push({ beatTime, chroma: new Array(12).fill(0), energy });
        continue;
      }

      try {
        const chroma = Meyda.extract('chroma', frame);
        if (chroma && chroma.length === 12) {
          beatChromas.push({
            beatTime,
            chroma: Array.from(chroma),
            energy,
          });
        }
      } catch {
        // Skip beats where extraction fails
      }
    }

    console.log(`   Extracted chroma for ${beatChromas.length} beats`);

    // ── 5. Match chord at each beat ──
    // Smooth: average chroma over groups of 2 beats for stability
    const BEATS_PER_CHORD = 4; // analyze chords in 4-beat groups (= 1 full bar in 4/4)

    interface BeatChord {
      time: number;
      label: string;
      confidence: number;
    }

    const chordPerBeat: BeatChord[] = [];

    for (let i = 0; i < beatChromas.length; i += BEATS_PER_CHORD) {
      const groupEnd = Math.min(i + BEATS_PER_CHORD, beatChromas.length);
      const avgChroma = new Array(12).fill(0);
      let count = 0;
      let totalEnergy = 0;

      for (let j = i; j < groupEnd; j++) {
        for (let k = 0; k < 12; k++) {
          avgChroma[k] += beatChromas[j].chroma[k];
        }
        totalEnergy += beatChromas[j].energy;
        count++;
      }

      for (let k = 0; k < 12; k++) {
        avgChroma[k] /= count;
      }

      const beatTime = beatChromas[i].beatTime;

      // If very low energy, mark as silence
      if (totalEnergy / count < 1e-6) {
        chordPerBeat.push({ time: beatTime, label: 'N', confidence: 0 });
        continue;
      }

      const match = matchChord(avgChroma);
      if (match.confidence < MIN_CONFIDENCE) {
        chordPerBeat.push({ time: beatTime, label: 'N', confidence: match.confidence });
      } else {
        chordPerBeat.push({ time: beatTime, label: match.label, confidence: match.confidence });
      }
    }

    console.log(`   Matched chords for ${chordPerBeat.length} beat groups`);

    // ── 6. Merge consecutive identical chords into events ──
    const events: ChordEvent[] = [];
    let eventIndex = 0;

    if (chordPerBeat.length > 0) {
      let currentLabel = chordPerBeat[0].label;
      let currentStart = chordPerBeat[0].time;
      let confSum = chordPerBeat[0].confidence;
      let confCount = 1;

      for (let i = 1; i < chordPerBeat.length; i++) {
        if (chordPerBeat[i].label !== currentLabel) {
          // Emit previous chord (skip silence)
          if (currentLabel !== 'N') {
            events.push({
              id: `beat-${eventIndex}`,
              time_seconds: Math.round(currentStart * 100) / 100,
              chord_label: currentLabel,
              confidence: Math.round((confSum / confCount) * 100) / 100,
            });
            eventIndex++;
          }

          currentLabel = chordPerBeat[i].label;
          currentStart = chordPerBeat[i].time;
          confSum = 0;
          confCount = 0;
        }
        confSum += chordPerBeat[i].confidence;
        confCount++;
      }

      // Emit last chord
      if (currentLabel !== 'N') {
        events.push({
          id: `beat-${eventIndex}`,
          time_seconds: Math.round(currentStart * 100) / 100,
          chord_label: currentLabel,
          confidence: Math.round((confSum / confCount) * 100) / 100,
        });
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ RealChordEngine: ${events.length} chords, BPM=${bpm}, in ${elapsed}s`);
    console.log(`   Beat interval: ${(60 / bpm).toFixed(2)}s`);

    return events;
  }
}
