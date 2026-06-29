import fs from 'fs';
import { ChordDetectionEngine, ChordEvent } from './ChordDetectionEngine';

/**
 * RealChordEngine — Beat-aligned chord detection with KEY DETECTION
 *
 * Pipeline:
 *   1. Decode audio to mono PCM
 *   2. Detect tempo (BPM) via onset strength + autocorrelation
 *   3. Build beat grid — exact timestamps where each beat falls
 *   4. Extract chroma (12-bin pitch class energy) per beat
 *   5. DETECT KEY from overall chroma distribution (Krumhansl-Kessler)
 *   6. Filter chord templates to only key-compatible chords
 *   7. Match each bar's chroma against filtered templates
 *   8. Merge consecutive identical chords into timed events
 */

// ─────────────────────────────────────────────
// Note names & constants
// ─────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─────────────────────────────────────────────
// Key Detection — Krumhansl-Kessler key profiles
// These represent how strongly each pitch class correlates
// with a given key. Used to detect the song's key from
// the overall chroma distribution.
// ─────────────────────────────────────────────

// Major key profile (rooted at C)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
// Minor key profile (rooted at C)
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

interface KeyResult {
  root: number;       // 0=C, 1=C#, ..., 11=B
  mode: 'major' | 'minor';
  name: string;       // e.g. "Em", "C"
  correlation: number;
}

/**
 * Detect key using Krumhansl-Kessler algorithm.
 * Correlates overall chroma distribution against rotated key profiles.
 */
function detectKey(overallChroma: number[]): KeyResult {
  // Normalize chroma
  const sum = overallChroma.reduce((s, v) => s + v, 0);
  const chroma = sum > 0 ? overallChroma.map(v => v / sum) : new Array(12).fill(0);

  let bestRoot = 0;
  let bestMode: 'major' | 'minor' = 'major';
  let bestCorr = -Infinity;

  for (let root = 0; root < 12; root++) {
    // Rotate the profile to this root
    for (const [mode, profile] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]] as const) {
      const rotated: number[] = new Array(12);
      for (let i = 0; i < 12; i++) {
        rotated[(i + root) % 12] = profile[i];
      }

      // Pearson correlation between chroma and rotated profile
      const meanC = chroma.reduce((s, v) => s + v, 0) / 12;
      const meanP = rotated.reduce((s, v) => s + v, 0) / 12;

      let num = 0, denC = 0, denP = 0;
      for (let i = 0; i < 12; i++) {
        const dc = chroma[i] - meanC;
        const dp = rotated[i] - meanP;
        num += dc * dp;
        denC += dc * dc;
        denP += dp * dp;
      }

      const corr = (denC > 0 && denP > 0) ? num / Math.sqrt(denC * denP) : 0;

      if (corr > bestCorr) {
        bestCorr = corr;
        bestRoot = root;
        bestMode = mode;
      }
    }
  }

  const name = bestMode === 'minor'
    ? `${NOTE_NAMES[bestRoot]}m`
    : NOTE_NAMES[bestRoot];

  return { root: bestRoot, mode: bestMode, name, correlation: bestCorr };
}

// ─────────────────────────────────────────────
// Diatonic chord sets per key
// Given a key root and mode, return the set of chord labels
// that are diatonic (belong to that key), plus common borrowed chords.
// ─────────────────────────────────────────────

/**
 * Build the set of chords that are valid for a given key.
 *
 * Major key (e.g. C major): I, ii, iii, IV, V, vi  + V7
 *   C: C, Dm, Em, F, G, Am + G7
 *
 * Minor key (e.g. A minor): i, ii°→ii, III, iv, v/V, VI, VII + V7
 *   Am: Am, Bm/Bdim→Bm, C, Dm, Em/E, F, G + E7
 */
function getDiatonicChords(root: number, mode: 'major' | 'minor'): Set<string> {
  const chords = new Set<string>();
  const r = (n: number) => NOTE_NAMES[(root + n) % 12];

  if (mode === 'major') {
    // I (major)
    chords.add(r(0));
    // ii (minor)
    chords.add(`${r(2)}m`);
    // iii (minor)
    chords.add(`${r(4)}m`);
    // IV (major)
    chords.add(r(5));
    // V (major)
    chords.add(r(7));
    // vi (minor)
    chords.add(`${r(9)}m`);
    // V7 (dominant 7th) — very common
    chords.add(`${r(7)}7`);
    // I7 — common passing chord
    chords.add(`${r(0)}7`);
    // IV as minor (borrowed from parallel minor) — occasional
    chords.add(`${r(5)}m`);
    // bVII (borrowed) — common in pop
    chords.add(r(10));
  } else {
    // i (minor)
    chords.add(`${r(0)}m`);
    // ii° — we approximate as ii minor
    chords.add(`${r(2)}m`);
    // III (major — relative major)
    chords.add(r(3));
    // iv (minor)
    chords.add(`${r(5)}m`);
    // v (minor — natural minor)
    chords.add(`${r(7)}m`);
    // V (major — harmonic minor, very common)
    chords.add(r(7));
    // VI (major)
    chords.add(r(8));
    // VII (major — natural minor)
    chords.add(r(10));
    // V7 (dominant 7th — very common in minor)
    chords.add(`${r(7)}7`);
    // i as major (picardy third, passing)
    chords.add(r(0));
    // iv as major — sometimes used
    chords.add(r(5));
    // II (borrowed, Neapolitan area)
    chords.add(r(2));
  }

  return chords;
}

// ─────────────────────────────────────────────
// Chord Templates — weighted profiles
// Indices: [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
// ─────────────────────────────────────────────

const CHORD_TYPES: Record<string, number[]> = {
  'maj': [1.5, 0, 0, 0, 1.0, 0, 0, 1.2, 0, 0, 0, 0],
  'm':   [1.5, 0, 0, 1.0, 0, 0, 0, 1.2, 0, 0, 0, 0],
  '7':   [1.5, 0, 0, 0, 1.0, 0, 0, 1.2, 0, 0, 0.7, 0],
  'm7':  [1.5, 0, 0, 1.0, 0, 0, 0, 1.2, 0, 0, 0.7, 0],
};

interface ChordTemplate {
  label: string;
  rootNote: number;
  profile: number[];
}

function buildAllTemplates(): ChordTemplate[] {
  const templates: ChordTemplate[] = [];
  for (const [typeName, baseProfile] of Object.entries(CHORD_TYPES)) {
    for (let root = 0; root < 12; root++) {
      const rotated = new Array(12);
      for (let i = 0; i < 12; i++) {
        rotated[(i + root) % 12] = baseProfile[i];
      }
      const label = typeName === 'maj'
        ? NOTE_NAMES[root]
        : `${NOTE_NAMES[root]}${typeName}`;
      templates.push({ label, rootNote: root, profile: rotated });
    }
  }
  return templates;
}

const ALL_TEMPLATES = buildAllTemplates();

// ─────────────────────────────────────────────
// Similarity & matching
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
  const max = Math.max(...chroma);
  if (max < 0.001) return new Array(12).fill(0);
  return chroma.map(v => v / max);
}

/**
 * Match chroma against ONLY the chords allowed by the key.
 * This is the key improvement — we don't consider G#m in a song in Em, etc.
 */
function matchChordInKey(
  chroma: number[],
  allowedChords: Set<string>,
): { label: string; confidence: number } {
  const normalized = normalizeChroma(chroma);
  let bestLabel = 'N';
  let bestScore = -1;

  // Filter templates to only allowed chords
  for (const tmpl of ALL_TEMPLATES) {
    if (!allowedChords.has(tmpl.label)) continue;

    const score = cosineSimilarity(normalized, tmpl.profile);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = tmpl.label;
    }
  }

  return { label: bestLabel, confidence: Math.max(0, Math.min(1, bestScore)) };
}

// ─────────────────────────────────────────────
// Beat detection
// ─────────────────────────────────────────────

const FRAME_SIZE = 1024;
const HOP = 512;
const MIN_BPM = 40;
const MAX_BPM = 220;
const MIN_CONFIDENCE = 0.55;

function computeOnsetEnvelope(samples: Float32Array, sampleRate: number): { envelope: number[]; times: number[] } {
  const envelope: number[] = [];
  const times: number[] = [];
  let prevSpectrum: number[] | null = null;

  for (let offset = 0; offset + FRAME_SIZE <= samples.length; offset += HOP) {
    const frame = samples.slice(offset, offset + FRAME_SIZE);

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

function detectBPM(envelope: number[], sampleRate: number): number {
  const hopDuration = HOP / sampleRate;
  const minLag = Math.floor(60 / (MAX_BPM * hopDuration));
  const maxLag = Math.floor(60 / (MIN_BPM * hopDuration));
  const N = envelope.length;

  const mean = envelope.reduce((s, v) => s + v, 0) / N;
  const normed = envelope.map(v => v - mean);

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

function buildBeatGrid(
  envelope: number[],
  times: number[],
  bpm: number,
  totalDuration: number,
): number[] {
  const maxOnset = Math.max(...envelope);
  const threshold = maxOnset * 0.15;

  let firstBeatTime = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > threshold) {
      firstBeatTime = times[i];
      break;
    }
  }

  const beatInterval = 60 / bpm;
  const beats: number[] = [];

  for (let t = firstBeatTime; t < totalDuration; t += beatInterval) {
    beats.push(Math.round(t * 100) / 100);
  }

  return beats;
}

// ─────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────

export class RealChordEngine implements ChordDetectionEngine {
  readonly name = 'RealChordEngine (Beat + Key Detection)';

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
    const Meyda = require('meyda');
    const CHROMA_BUFFER = 8192;
    Meyda.bufferSize = CHROMA_BUFFER;
    Meyda.sampleRate = sampleRate;

    interface BeatChroma {
      beatTime: number;
      chroma: number[];
      energy: number;
    }

    const beatChromas: BeatChroma[] = [];
    const overallChroma = new Array(12).fill(0); // accumulate for key detection
    let chromaCount = 0;

    for (const beatTime of beats) {
      const centerSample = Math.floor(beatTime * sampleRate);
      const halfWindow = Math.floor(CHROMA_BUFFER / 2);
      const start = Math.max(0, centerSample - halfWindow);

      if (start + CHROMA_BUFFER > samples.length) continue;

      const frame = samples.slice(start, start + CHROMA_BUFFER);

      let energy = 0;
      for (let i = 0; i < frame.length; i++) {
        energy += frame[i] * frame[i];
      }
      energy /= frame.length;

      if (energy < 1e-6) {
        beatChromas.push({ beatTime, chroma: new Array(12).fill(0), energy });
        continue;
      }

      try {
        const chroma = Meyda.extract('chroma', frame);
        if (chroma && chroma.length === 12) {
          const chromaArr = Array.from(chroma) as number[];
          beatChromas.push({ beatTime, chroma: chromaArr, energy });

          // Accumulate for key detection (weighted by energy)
          for (let k = 0; k < 12; k++) {
            overallChroma[k] += chromaArr[k] * energy;
          }
          chromaCount++;
        }
      } catch {
        // Skip
      }
    }

    console.log(`   Extracted chroma for ${beatChromas.length} beats`);

    // ── 5. DETECT KEY ──
    const key = detectKey(overallChroma);
    console.log(`   🎼 Detected Key: ${key.name} (correlation: ${key.correlation.toFixed(3)})`);

    // ── 6. Build allowed chord set for this key ──
    const allowedChords = getDiatonicChords(key.root, key.mode);
    console.log(`   🎹 Allowed chords: ${Array.from(allowedChords).join(', ')}`);

    // ── 7. Detect chord at EVERY INDIVIDUAL BEAT ──
    const BEATS_PER_BAR = 4;

    interface BeatChord {
      time: number;
      label: string;
      confidence: number;
    }

    const chordPerBeat: BeatChord[] = [];

    for (let i = 0; i < beatChromas.length; i++) {
      const bc = beatChromas[i];

      if (bc.energy < 1e-6) {
        chordPerBeat.push({ time: bc.beatTime, label: 'N', confidence: 0 });
        continue;
      }

      const match = matchChordInKey(bc.chroma, allowedChords);
      if (match.confidence < MIN_CONFIDENCE) {
        chordPerBeat.push({ time: bc.beatTime, label: 'N', confidence: match.confidence });
      } else {
        chordPerBeat.push({ time: bc.beatTime, label: match.label, confidence: match.confidence });
      }
    }

    console.log(`   Detected chords at ${chordPerBeat.length} individual beats`);

    // ── 8. Snap chord changes to bar/half-bar boundaries via majority voting ──
    //
    // For each 4-beat bar, we check:
    //   a) If all/most beats agree → one chord for the whole bar
    //   b) If the first half (beats 0-1) differs from second half (beats 2-3)
    //      → allow a chord split at the half-bar boundary
    //   c) Otherwise, majority wins for the whole bar
    //
    // This prevents chord changes from landing on beat 2 or beat 4
    // (mid-bar positions that sound wrong musically).

    interface BarChord {
      time: number;
      label: string;
      confidence: number;
    }

    const chordPerBar: BarChord[] = [];

    /** Pick the majority chord from a slice of beat chords */
    function majorityVote(beats: BeatChord[]): { label: string; avgConf: number } {
      const counts = new Map<string, { count: number; totalConf: number }>();
      for (const b of beats) {
        const entry = counts.get(b.label) || { count: 0, totalConf: 0 };
        entry.count++;
        entry.totalConf += b.confidence;
        counts.set(b.label, entry);
      }

      let bestLabel = 'N';
      let bestCount = 0;
      let bestConf = 0;

      for (const [label, { count, totalConf }] of counts) {
        if (count > bestCount || (count === bestCount && totalConf > bestConf)) {
          bestLabel = label;
          bestCount = count;
          bestConf = totalConf;
        }
      }

      return { label: bestLabel, avgConf: bestConf / beats.length };
    }

    for (let i = 0; i < chordPerBeat.length; i += BEATS_PER_BAR) {
      const barEnd = Math.min(i + BEATS_PER_BAR, chordPerBeat.length);
      const barBeats = chordPerBeat.slice(i, barEnd);

      if (barBeats.length < 2) {
        // Not enough beats for a full bar — just use the single beat
        chordPerBar.push({
          time: barBeats[0].time,
          label: barBeats[0].label,
          confidence: barBeats[0].confidence,
        });
        continue;
      }

      // Full-bar majority
      const fullVote = majorityVote(barBeats);

      // Check for a clear half-bar split
      const halfPoint = Math.floor(barBeats.length / 2);
      const firstHalf = barBeats.slice(0, halfPoint);
      const secondHalf = barBeats.slice(halfPoint);

      const firstVote = majorityVote(firstHalf);
      const secondVote = majorityVote(secondHalf);

      // A half-bar split is valid if:
      //  - First and second half have different chords
      //  - Both halves are internally consistent (non-N chords)
      //  - Each half's chord covers all its beats (strong agreement)
      const firstAllAgree = firstHalf.every(b => b.label === firstVote.label || b.label === 'N');
      const secondAllAgree = secondHalf.every(b => b.label === secondVote.label || b.label === 'N');
      const shouldSplit =
        firstVote.label !== secondVote.label &&
        firstVote.label !== 'N' &&
        secondVote.label !== 'N' &&
        firstAllAgree &&
        secondAllAgree;

      if (shouldSplit) {
        // Two chords in this bar, split at the half-bar boundary
        chordPerBar.push({
          time: firstHalf[0].time,
          label: firstVote.label,
          confidence: firstVote.avgConf,
        });
        chordPerBar.push({
          time: secondHalf[0].time,
          label: secondVote.label,
          confidence: secondVote.avgConf,
        });
      } else {
        // One chord for the whole bar — majority wins
        chordPerBar.push({
          time: barBeats[0].time,
          label: fullVote.label,
          confidence: fullVote.avgConf,
        });
      }
    }

    console.log(`   Snapped to ${chordPerBar.length} bar/half-bar segments`);

    // ── 9. Merge consecutive identical chords into events ──
    const events: ChordEvent[] = [];
    let eventIndex = 0;

    if (chordPerBar.length > 0) {
      let currentLabel = chordPerBar[0].label;
      let currentStart = chordPerBar[0].time;
      let confSum = chordPerBar[0].confidence;
      let confCount = 1;

      for (let i = 1; i < chordPerBar.length; i++) {
        if (chordPerBar[i].label !== currentLabel) {
          if (currentLabel !== 'N') {
            events.push({
              id: `beat-${eventIndex}`,
              time_seconds: Math.round(currentStart * 100) / 100,
              chord_label: currentLabel,
              confidence: Math.round((confSum / confCount) * 100) / 100,
            });
            eventIndex++;
          }

          currentLabel = chordPerBar[i].label;
          currentStart = chordPerBar[i].time;
          confSum = 0;
          confCount = 0;
        }
        confSum += chordPerBar[i].confidence;
        confCount++;
      }

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
    console.log(`✅ RealChordEngine: ${events.length} chords, Key=${key.name}, BPM=${bpm}, in ${elapsed}s`);

    return events;
  }
}
